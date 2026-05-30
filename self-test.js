const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { JSDOM } = require("jsdom");

const notices = [];
let requestHandler = async () => {
  throw new Error("requestHandler not configured");
};

const obsidianStub = {
  Notice: class Notice {
    constructor(message) {
      notices.push(message);
    }
  },
  Plugin: class Plugin {
    async loadData() {
      return {};
    }

    async saveData() {}

    addSettingTab() {}

    addCommand() {}
  },
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {
    setName() {
      return this;
    }

    setDesc() {
      return this;
    }

    addText(callback) {
      callback({
        setPlaceholder() {
          return this;
        },
        setValue() {
          return this;
        },
        onChange() {
          return this;
        },
      });
      return this;
    }

    addToggle(callback) {
      callback({
        setValue() {
          return this;
        },
        onChange() {
          return this;
        },
      });
      return this;
    }
  },
  requestUrl: (...args) => requestHandler(...args),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return obsidianStub;
  }

  return originalLoad.call(this, request, parent, isMain);
};

function installDom() {
  const html = `
    <body>
      <div class="modal mod-community-plugin">
        <div class="modal-content">
          <div class="modal-sidebar">
            <div class="community-modal-search-results">
              <div class="community-item tappable">
                <div class="community-item-name">Other Plugin</div>
                <div class="community-item-desc">This text should stay untouched because it belongs to the list.</div>
              </div>
            </div>
          </div>
          <div class="community-modal-details">
            <div class="community-modal-info">
              <div class="community-modal-info-name">Sample Plugin</div>
              <div class="community-modal-info-author">by Tester</div>
              <div class="community-modal-info-desc">Powerful note automation for researchers.</div>
            </div>
            <div class="markdown-rendered">
              <p>Translate plugin descriptions into Chinese with a single click.</p>
              <p>Show the original text and the translated result side by side.</p>
              <ul>
                <li>Supports community marketplace details.</li>
                <li>Updates progress while the translation is running.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </body>
  `;

  const dom = new JSDOM(html, { pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.MutationObserver = dom.window.MutationObserver;
  global.navigator = dom.window.navigator;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  global.TextDecoder = global.TextDecoder || dom.window.TextDecoder;

  Object.defineProperty(global.window.HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent;
    },
    set(value) {
      this.textContent = value;
    },
  });

  Object.defineProperty(global.window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });

  global.window.HTMLElement.prototype.getClientRects = function getClientRects() {
    return [1];
  };

  return dom;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMockChinese(text) {
  return `【中文】${text.replace(/[A-Za-z]/g, "汉")}`;
}

async function main() {
  const dom = installDom();
  const pluginPath = path.join(__dirname, "main.js");
  const pluginModule = require(pluginPath);
  const CommunityPluginDetailTranslator = pluginModule.default || pluginModule;
  const plugin = new CommunityPluginDetailTranslator();

  plugin.app = {};
  plugin.settings = {
    sourceLanguage: "auto",
    targetLanguage: "zh-CN",
    requestTimeoutMs: 5000,
  };
  plugin.translationCache = new Map();
  plugin.rootState = new WeakMap();
  plugin.translateText = async (text) => toMockChinese(text);
  plugin.translateBatch = async (groups) => new Map(groups.map((group) => [group.text, toMockChinese(group.text)]));

  requestHandler = async () => {
    await wait(120);
    return {
      status: 200,
      text: JSON.stringify([[[]]]),
    };
  };

  const root = document.querySelector(".community-modal-details");
  assert.ok(root, "detail root should exist");
  assert.equal(plugin.shouldTranslate("これは日本語の説明です"), true, "non-Latin text should also be considered translatable");
  assert.equal(plugin.getTranslateActionLabel(), "Translate to Chinese (Simplified)", "button label should reflect the current target language");

  plugin.ensureUi(root);

  const hiddenSection = document.createElement("div");
  hiddenSection.style.display = "none";
  hiddenSection.textContent = "Translate every hidden section in the full details view.";
  root.appendChild(hiddenSection);

  const button = root.querySelector(".cpdt-button");
  assert.ok(button, "translation button should be injected");

  const startTime = Date.now();
  const translatePromise = plugin.translateIntoPage(root);

  await wait(170);
  assert.ok(button.textContent.length > 0, "button text should remain readable while translating");

  await translatePromise;
  const durationMs = Date.now() - startTime;

  assert.ok(root.textContent.includes("【中文】"), "detail page text should be replaced with Chinese");
  assert.ok(hiddenSection.textContent.startsWith("【中文】"), "hidden detail content should also be translated");
  assert.ok(document.body.textContent.includes("This text should stay untouched because it belongs to the list."), "sidebar list text should stay untouched");
  assert.ok(!root.textContent.includes("Translate plugin descriptions into Chinese with a single click."), "original detail text should not remain visible after translation");
  assert.ok(durationMs < 520, `batch translation should stay fast in the test environment, got ${durationMs}ms`);
  assert.equal(button.textContent, "Show original", "button should switch to Show original after translation");

  button.click();
  assert.ok(root.textContent.includes("Translate plugin descriptions into Chinese with a single click."), "clicking again should restore original text");
  assert.equal(button.textContent, "Show translation", "button should switch to Show translation after restoring original text");

  button.click();
  assert.ok(root.textContent.includes("【中文】"), "clicking a third time should show the translation again");
  assert.equal(button.textContent, "Show original", "button should switch back to Show original after reapplying translation");

  assert.equal(notices.length, 0, "no error notices should appear on the success path");
  dom.window.close();
  console.log(`Self-test passed in ${durationMs}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
