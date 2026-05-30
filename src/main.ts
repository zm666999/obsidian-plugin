import { App, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";

interface PluginSettings {
  sourceLanguage: string;
  targetLanguage: string;
  requestTimeoutMs: number;
}

interface LanguageOption {
  value: string;
  label: string;
}

interface TranslationEntry {
  node: Text;
  originalValue: string;
  originalText: string;
  priority: boolean;
  translatedText: string | null;
}

interface TranslationGroup {
  text: string;
  entries: TranslationEntry[];
  priority: boolean;
  translatedText: string | null;
}

interface RootState {
  pluginKey: string;
  translating: boolean;
  translated: boolean;
  showingTranslation: boolean;
  currentRunId: number;
  toolbar: HTMLDivElement | null;
  button: HTMLButtonElement | null;
  status: HTMLSpanElement | null;
  entries: TranslationEntry[];
}

interface ProgressCounters {
  completed: number;
  failed: number;
  total: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
  sourceLanguage: "auto",
  targetLanguage: "zh-CN",
  requestTimeoutMs: 15000,
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "auto", label: "Auto detect" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

const TARGET_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS.filter((option) => option.value !== "auto");
const LANGUAGE_LABELS = new Map(LANGUAGE_OPTIONS.map((option) => [option.value, option.label]));

const MAX_CONCURRENT_TRANSLATIONS = 4;
const BATCH_TRANSLATION_MAX_CHARS = 1200;
const DETAIL_ROOT_SELECTORS = [".community-modal-details", ".community-plugin-details"] as const;

export default class CommunityPluginDetailTranslator extends Plugin {
  settings!: PluginSettings;
  translationCache = new Map<string, string>();
  rootState = new WeakMap<HTMLElement, RootState>();
  observer: MutationObserver | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new CommunityPluginDetailTranslatorSettingTab(this.app, this));
    this.addCommand({
      id: "translate-current-community-plugin-details",
      name: "Translate current community plugin details",
      callback: async () => {
        const translated = await this.translateFirstVisibleDetails();
        if (!translated) {
          new Notice("No visible community plugin detail page found.");
        }
      },
    });

    this.startObserver();
    window.setTimeout(() => this.scanAndInject(), 800);
  }

  onunload(): void {
    this.stopObserver();
  }

  async loadSettings(): Promise<void> {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as Partial<PluginSettings>;
    this.settings = {
      sourceLanguage: this.normalizeSourceLanguage(loaded.sourceLanguage),
      targetLanguage: this.normalizeTargetLanguage(loaded.targetLanguage),
      requestTimeoutMs:
        Number.isFinite(loaded.requestTimeoutMs) && Number(loaded.requestTimeoutMs) > 1000
          ? Number(loaded.requestTimeoutMs)
          : DEFAULT_SETTINGS.requestTimeoutMs,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  normalizeSourceLanguage(value: string | undefined): string {
    const normalized = String(value || "").trim();
    return normalized || DEFAULT_SETTINGS.sourceLanguage;
  }

  normalizeTargetLanguage(value: string | undefined): string {
    const normalized = String(value || "").trim();
    if (!normalized || normalized === "auto") {
      return DEFAULT_SETTINGS.targetLanguage;
    }

    return normalized;
  }

  getSourceLanguage(): string {
    return this.normalizeSourceLanguage(this.settings.sourceLanguage);
  }

  getTargetLanguage(): string {
    return this.normalizeTargetLanguage(this.settings.targetLanguage);
  }

  getLanguageLabel(code: string): string {
    return LANGUAGE_LABELS.get(code) || code;
  }

  getTranslateActionLabel(): string {
    return `Translate to ${this.getLanguageLabel(this.getTargetLanguage())}`;
  }

  invalidateTranslations(): void {
    this.translationCache.clear();

    const roots = new Set<HTMLElement>();
    for (const selector of DETAIL_ROOT_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of Array.from(nodes)) {
        const root = this.resolveDetailRoot(node);
        if (root instanceof HTMLElement) {
          roots.add(root);
        }
      }
    }

    for (const root of roots) {
      const state = this.rootState.get(root);
      if (state) {
        this.resetState(state);
      }
    }
  }

  startObserver(): void {
    this.stopObserver();

    this.observer = new MutationObserver((mutations) => {
      const changed = mutations.some((mutation) => mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
      if (!changed) {
        return;
      }

      window.requestAnimationFrame(() => this.scanAndInject());
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  scanAndInject(): void {
    const roots = new Set<HTMLElement>();

    for (const selector of DETAIL_ROOT_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of Array.from(nodes)) {
        const root = this.resolveDetailRoot(node);
        if (root instanceof HTMLElement) {
          roots.add(root);
        }
      }
    }

    for (const root of roots) {
      this.ensureUi(root);
      this.syncRootState(root);
    }
  }

  resolveDetailRoot(node: Element | HTMLElement | null): HTMLElement | null {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    if (node.matches(".community-modal-details, .community-plugin-details")) {
      return node;
    }

    return node.querySelector<HTMLElement>(".community-modal-details, .community-plugin-details");
  }

  syncRootState(root: HTMLElement): void {
    const state = this.getOrCreateState(root);
    const currentPluginKey = this.getPluginKey(root);

    if (state.pluginKey && state.pluginKey !== currentPluginKey) {
      this.resetState(state);
    }

    state.pluginKey = currentPluginKey;
  }

  getOrCreateState(root: HTMLElement): RootState {
    let state = this.rootState.get(root);

    if (!state) {
      state = {
        pluginKey: "",
        translating: false,
        translated: false,
        showingTranslation: false,
        currentRunId: 0,
        toolbar: null,
        button: null,
        status: null,
        entries: [],
      };
      this.rootState.set(root, state);
    }

    return state;
  }

  resetState(state: RootState): void {
    state.currentRunId += 1;
    this.applyViewMode(state.entries, false);
    state.translating = false;
    state.translated = false;
    state.showingTranslation = false;
    state.entries = [];

    if (state.button) {
      state.button.disabled = false;
      state.button.textContent = this.getTranslateActionLabel();
    }

    if (state.status) {
      state.status.textContent = "";
    }
  }

  ensureUi(root: HTMLElement): void {
    const state = this.getOrCreateState(root);

    if (state.toolbar && state.toolbar.isConnected) {
      return;
    }

    const anchor = root.querySelector<HTMLElement>(".community-plugin-info, .community-modal-info");
    if (!(anchor instanceof HTMLElement) || !anchor.parentElement || anchor === root) {
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.className = "cpdt-toolbar";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mod-cta cpdt-button";
    button.textContent = this.getTranslateActionLabel();
    button.addEventListener("click", async () => {
      await this.handleTranslateButtonClick(root);
    });

    const status = document.createElement("span");
    status.className = "cpdt-status";

    toolbar.appendChild(button);
    toolbar.appendChild(status);
    anchor.insertAdjacentElement("afterend", toolbar);

    state.toolbar = toolbar;
    state.button = button;
    state.status = status;
    state.pluginKey = this.getPluginKey(root);
  }

  async handleTranslateButtonClick(root: HTMLElement): Promise<void> {
    const state = this.getOrCreateState(root);

    if (state.translating) {
      return;
    }

    if (state.translated) {
      state.showingTranslation = !state.showingTranslation;
      this.applyViewMode(state.entries, state.showingTranslation);
      if (state.button) {
        state.button.textContent = state.showingTranslation ? "Show original" : "Show translation";
      }
      if (state.status) {
        state.status.textContent = state.showingTranslation ? "Chinese translation visible" : "Original text restored";
      }
      return;
    }

    await this.translateIntoPage(root);
  }

  async translateFirstVisibleDetails(): Promise<boolean> {
    const roots: HTMLElement[] = [];

    for (const selector of DETAIL_ROOT_SELECTORS) {
      const nodes = document.querySelectorAll(selector);
      for (const node of Array.from(nodes)) {
        const root = this.resolveDetailRoot(node);
        if (root instanceof HTMLElement && this.isVisible(root) && !roots.includes(root)) {
          roots.push(root);
        }
      }
    }

    const root = roots[0];
    if (!root) {
      return false;
    }

    this.ensureUi(root);
    await this.translateIntoPage(root);
    return true;
  }

  isVisible(element: HTMLElement): boolean {
    return element.getClientRects().length > 0 && element.offsetParent !== null;
  }

  async translateIntoPage(root: HTMLElement): Promise<void> {
    const state = this.getOrCreateState(root);
    const entries = this.collectTranslatableEntries(root);

    if (!state.button || !state.status) {
      this.ensureUi(root);
    }

    if (!state.button || !state.status) {
      new Notice("Unable to attach translation controls to this detail page.");
      return;
    }

    if (!entries.length) {
      state.status.textContent = "No translatable text found on this page.";
      new Notice("No translatable text found on this page.");
      return;
    }

    const runId = state.currentRunId + 1;
    state.currentRunId = runId;
    state.translating = true;
    state.translated = false;
    state.showingTranslation = false;
    state.entries = entries;
    state.button.disabled = true;
    state.button.textContent = "Translating...";
    state.status.textContent = `Preparing ${entries.length} text blocks`;

    try {
      const groups = this.buildTranslationGroups(entries);
      const counters: ProgressCounters = {
        completed: 0,
        failed: 0,
        total: entries.length,
      };

      for (const group of groups) {
        if (!group.translatedText) {
          continue;
        }

        this.applyTranslatedGroup(group);
        counters.completed += group.entries.length;
      }

      if (counters.completed > 0) {
        state.showingTranslation = true;
        state.status.textContent = this.buildProgressText(counters.completed, counters.total, counters.failed);
      }

      const uncachedGroups = groups.filter((group) => !group.translatedText);
      const priorityGroups = uncachedGroups.filter((group) => group.priority);
      const remainingGroups = uncachedGroups.filter((group) => !group.priority);

      if (priorityGroups.length) {
        state.status.textContent = `Prioritizing ${priorityGroups.length} summary blocks`;
        await this.translatePriorityGroups(priorityGroups, state, runId, counters);
      }

      if (remainingGroups.length && state.currentRunId === runId) {
        await this.translateGroupBatches(remainingGroups, state, runId, counters);
      }

      if (state.currentRunId !== runId) {
        return;
      }

      state.translated = counters.completed > 0;
      state.showingTranslation = counters.completed > 0;
      state.button.textContent = counters.completed > 0 ? "Show original" : "Retry translation";
      state.status.textContent = this.buildCompletionText(counters.completed, counters.total, counters.failed);
    } catch (error) {
      if (state.currentRunId !== runId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      state.status.textContent = "Translation failed";
      state.button.textContent = "Retry translation";
      new Notice(`Community plugin translation failed: ${message}`);
    } finally {
      if (state.currentRunId !== runId) {
        return;
      }

      state.translating = false;
      state.button.disabled = false;
    }
  }

  collectTranslatableEntries(root: HTMLElement): TranslationEntry[] {
    const entries: TranslationEntry[] = [];
    const showText = window.NodeFilter ? window.NodeFilter.SHOW_TEXT : 4;
    const walker = document.createTreeWalker(root, showText);

    let node = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      if (this.isTranslatableTextNode(textNode)) {
        const parentElement = textNode.parentElement;
        entries.push({
          node: textNode,
          originalValue: textNode.nodeValue || "",
          originalText: this.normalizeText(textNode.nodeValue || ""),
          priority: !!parentElement?.closest(".community-modal-info, .community-plugin-info"),
          translatedText: null,
        });
      }

      node = walker.nextNode();
    }

    return entries;
  }

  isTranslatableTextNode(node: Node | Text | null): node is Text {
    if (!(node instanceof Text) || !(node.parentElement instanceof HTMLElement)) {
      return false;
    }

    const parent = node.parentElement;
    if (parent.closest(".cpdt-toolbar")) {
      return false;
    }

    if (parent.closest("script, style, textarea, input, select, option, pre, code, kbd, samp")) {
      return false;
    }

    return this.shouldTranslate(this.normalizeText(node.nodeValue || ""));
  }

  buildTranslationGroups(entries: TranslationEntry[]): TranslationGroup[] {
    const groups = new Map<string, TranslationGroup>();

    for (const entry of entries) {
      let group = groups.get(entry.originalText);
      if (!group) {
        group = {
          text: entry.originalText,
          entries: [],
          priority: false,
          translatedText: this.translationCache.get(entry.originalText) || null,
        };
        groups.set(entry.originalText, group);
      }

      group.entries.push(entry);
      group.priority = group.priority || entry.priority;
    }

    return Array.from(groups.values());
  }

  buildTranslationBatches(groups: TranslationGroup[]): TranslationGroup[][] {
    const batches: TranslationGroup[][] = [];
    let currentBatch: TranslationGroup[] = [];
    let currentSize = 0;

    for (const group of groups) {
      const estimatedSize = group.text.length + 40;
      if (currentBatch.length && currentSize + estimatedSize > BATCH_TRANSLATION_MAX_CHARS) {
        batches.push(currentBatch);
        currentBatch = [];
        currentSize = 0;
      }

      currentBatch.push(group);
      currentSize += estimatedSize;
    }

    if (currentBatch.length) {
      batches.push(currentBatch);
    }

    return batches;
  }

  normalizeText(text: string): string {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  shouldTranslate(text: string): boolean {
    if (!text || text.length < 3) {
      return false;
    }

    if (!/[\p{L}]/u.test(text)) {
      return false;
    }

    if (/^https?:\/\//i.test(text)) {
      return false;
    }

    return true;
  }

  async translatePriorityGroups(
    groups: TranslationGroup[],
    state: RootState,
    runId: number,
    counters: ProgressCounters
  ): Promise<void> {
    for (const group of groups) {
      if (state.currentRunId !== runId) {
        return;
      }

      try {
        const translatedText = await this.translateText(group.text);
        if (state.currentRunId !== runId) {
          return;
        }

        this.translationCache.set(group.text, translatedText);
        group.translatedText = translatedText;
        this.applyTranslatedGroup(group);
        counters.completed += group.entries.length;
      } catch {
        counters.failed += group.entries.length;
      }

      state.showingTranslation = counters.completed > 0;
      if (state.status) {
        state.status.textContent = this.buildProgressText(counters.completed, counters.total, counters.failed);
      }
    }
  }

  async translateGroupBatches(
    groups: TranslationGroup[],
    state: RootState,
    runId: number,
    counters: ProgressCounters
  ): Promise<void> {
    const batches = this.buildTranslationBatches(groups);
    await this.runWithConcurrency(
      batches.map((batch) => async () => {
        try {
          const translations = await this.translateBatch(batch);
          if (state.currentRunId !== runId) {
            return;
          }

          for (const group of batch) {
            const translatedText = translations.get(group.text);
            if (!translatedText) {
              counters.failed += group.entries.length;
              continue;
            }

            this.translationCache.set(group.text, translatedText);
            group.translatedText = translatedText;
            this.applyTranslatedGroup(group);
            counters.completed += group.entries.length;
          }
        } catch {
          for (const group of batch) {
            if (state.currentRunId !== runId) {
              return;
            }

            try {
              const translatedText = await this.translateText(group.text);
              if (state.currentRunId !== runId) {
                return;
              }

              this.translationCache.set(group.text, translatedText);
              group.translatedText = translatedText;
              this.applyTranslatedGroup(group);
              counters.completed += group.entries.length;
            } catch {
              counters.failed += group.entries.length;
            }
          }
        } finally {
          if (state.currentRunId !== runId) {
            return;
          }

          state.showingTranslation = counters.completed > 0;
          if (state.status) {
            state.status.textContent = this.buildProgressText(counters.completed, counters.total, counters.failed);
          }
        }
      }),
      MAX_CONCURRENT_TRANSLATIONS
    );
  }

  async runWithConcurrency(taskFactories: Array<() => Promise<void>>, limit: number): Promise<void> {
    if (!taskFactories.length) {
      return;
    }

    let nextIndex = 0;
    const workerCount = Math.min(limit, taskFactories.length);

    const worker = async (): Promise<void> => {
      while (nextIndex < taskFactories.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await taskFactories[currentIndex]();
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  chunkText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const sentenceParts: string[] = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const matches = trimmedLine.match(/[^.!?。！？]+[.!?。！？]?/g);
      if (matches && matches.length) {
        for (const match of matches) {
          sentenceParts.push(match.trim());
        }
      } else {
        sentenceParts.push(trimmedLine);
      }
    }

    const chunks: string[] = [];
    let currentChunk = "";
    for (const sentence of sentenceParts) {
      const nextChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      if (nextChunk.length > maxLength && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
        continue;
      }

      if (sentence.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = "";
        }

        let remaining = sentence;
        while (remaining.length > maxLength) {
          chunks.push(remaining.slice(0, maxLength));
          remaining = remaining.slice(maxLength);
        }
        currentChunk = remaining;
        continue;
      }

      currentChunk = nextChunk;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length ? chunks : [text];
  }

  async translateText(text: string): Promise<string> {
    const normalizedText = this.normalizeText(text || "");
    if (!this.shouldTranslate(normalizedText)) {
      return normalizedText;
    }

    const chunks = this.chunkText(normalizedText, BATCH_TRANSLATION_MAX_CHARS);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      translatedChunks.push(await this.translateChunkWithFallback(chunk));
    }

    return translatedChunks.join("\n").trim();
  }

  async translateBatch(groups: TranslationGroup[]): Promise<Map<string, string>> {
    if (!groups.length) {
      return new Map();
    }

    if (groups.length === 1) {
      const translatedText = await this.translateText(groups[0].text);
      return new Map([[groups[0].text, translatedText]]);
    }

    const markedText = groups
      .map((group, index) => `[[CPDT_${index}]]${group.text}[[/CPDT_${index}]]`)
      .join("\n\n");

    const translatedMarkedText = await this.translateChunkWithFallback(markedText);
    const translations = new Map<string, string>();
    const pattern = /\[\[CPDT_(\d+)\]\]([\s\S]*?)\[\[\/CPDT_\1\]\]/g;

    let match = pattern.exec(translatedMarkedText);
    while (match) {
      const groupIndex = Number(match[1]);
      const translatedText = this.normalizeText(match[2] || "");

      if (Number.isInteger(groupIndex) && groups[groupIndex] && translatedText) {
        translations.set(groups[groupIndex].text, translatedText);
      }

      match = pattern.exec(translatedMarkedText);
    }

    if (translations.size !== groups.length) {
      throw new Error(`Incomplete batch translation result (${translations.size}/${groups.length})`);
    }

    return translations;
  }

  async translateChunkWithFallback(text: string): Promise<string> {
    const errors: string[] = [];

    try {
      return await this.translateWithGoogle(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Google: ${message}`);
    }

    try {
      return await this.translateWithMyMemory(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`MyMemory: ${message}`);
    }

    throw new Error(errors.join(" | "));
  }

  async translateWithGoogle(text: string): Promise<string> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(this.getSourceLanguage())}&tl=${encodeURIComponent(this.getTargetLanguage())}&dt=t&q=${encodeURIComponent(text)}`;
    const responseText = await this.requestText(url);
    const data = JSON.parse(responseText) as unknown[];

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error("Invalid Google response format");
    }

    const translated = (data[0] as unknown[])
      .map((item) => (Array.isArray(item) ? String(item[0] || "") : ""))
      .join("")
      .trim();

    if (!translated) {
      throw new Error("Google returned no translated text");
    }

    return translated;
  }

  async translateWithMyMemory(text: string): Promise<string> {
    const sourceLanguage = this.getSourceLanguage();
    if (sourceLanguage === "auto") {
      throw new Error("MyMemory fallback requires an explicit source language");
    }

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLanguage)}|${encodeURIComponent(this.getTargetLanguage())}`;
    const responseText = await this.requestText(url);
    const data = JSON.parse(responseText) as { responseData?: { translatedText?: string } };
    const translated = data?.responseData?.translatedText?.trim() || "";

    if (!translated) {
      throw new Error("MyMemory returned no translated text");
    }

    return translated;
  }

  async requestText(url: string): Promise<string> {
    const response = await this.withTimeout(
      requestUrl({
        url,
        method: "GET",
        throw: false,
      }),
      this.settings.requestTimeoutMs
    );

    if (!response || typeof response.status !== "number") {
      throw new Error("Translation service returned no valid response");
    }

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (typeof response.text === "string") {
      return response.text;
    }

    if (response.arrayBuffer) {
      return new TextDecoder("utf-8").decode(response.arrayBuffer);
    }

    throw new Error("Translation service returned no text body");
  }

  withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });
  }

  applyTranslatedGroup(group: TranslationGroup): void {
    for (const entry of group.entries) {
      entry.translatedText = group.translatedText;
      this.applyTranslatedEntry(entry);
    }
  }

  applyTranslatedEntry(entry: TranslationEntry): void {
    if (!entry.node.isConnected || !entry.translatedText) {
      return;
    }

    entry.node.nodeValue = this.withOriginalWhitespace(entry.originalValue, entry.translatedText);
  }

  applyViewMode(entries: TranslationEntry[], showTranslation: boolean): void {
    for (const entry of entries) {
      if (!entry.node.isConnected) {
        continue;
      }

      if (showTranslation && entry.translatedText) {
        entry.node.nodeValue = this.withOriginalWhitespace(entry.originalValue, entry.translatedText);
      } else {
        entry.node.nodeValue = entry.originalValue;
      }
    }
  }

  withOriginalWhitespace(originalValue: string, translatedText: string): string {
    const leading = originalValue.match(/^\s*/)?.[0] || "";
    const trailing = originalValue.match(/\s*$/)?.[0] || "";
    return `${leading}${translatedText}${trailing}`;
  }

  buildProgressText(completed: number, total: number, failed: number): string {
    if (failed > 0) {
      return `Processed ${completed}/${total}, failed ${failed}`;
    }

    return `Processed ${completed}/${total}`;
  }

  buildCompletionText(successCount: number, total: number, failed: number): string {
    if (successCount <= 0) {
      return `Translation failed ${failed}/${total}`;
    }

    if (failed > 0) {
      return `Translated ${successCount}/${total}, failed ${failed}`;
    }

    return `Translated ${successCount} text blocks`;
  }

  getPluginKey(root: HTMLElement): string {
    const stableSelectors = [
      'a[href*="community.obsidian.md/plugins/"]',
      'a[href*="/releases/latest"]',
      'a[href*="github.com/"]',
    ];

    for (const selector of stableSelectors) {
      const stableLink = root.querySelector<HTMLAnchorElement>(selector);
      const stableHref = stableLink ? String(stableLink.getAttribute("href") || "").trim() : "";
      if (stableHref) {
        return stableHref;
      }
    }

    const selectedItem = document.querySelector<HTMLElement>(".community-item.is-selected");
    const selectedName = selectedItem?.querySelector<HTMLElement>(".community-item-name");
    const selectedNameText = selectedName ? this.normalizeText(selectedName.textContent || "") : "";
    if (selectedNameText) {
      return `selected::${selectedNameText}`;
    }

    const title = root.querySelector<HTMLElement>("h1, h2, h3, .community-plugin-name, .community-modal-info-name");
    const author = root.querySelector<HTMLElement>(".community-plugin-info a, .community-plugin-info span, .community-modal-info-author");
    const titleText = title ? this.normalizeText(title.textContent || "") : "";
    const authorText = author ? this.normalizeText(author.textContent || "") : "";
    return `${titleText}::${authorText}`;
  }
}

class CommunityPluginDetailTranslatorSettingTab extends PluginSettingTab {
  plugin: CommunityPluginDetailTranslator;

  constructor(app: App, plugin: CommunityPluginDetailTranslator) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Source language")
      .setDesc("Choose Auto detect for mixed-language or unknown detail pages.")
      .addDropdown((dropdown) => {
        for (const option of LANGUAGE_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(this.plugin.getSourceLanguage());
        dropdown.onChange(async (value) => {
          this.plugin.settings.sourceLanguage = this.plugin.normalizeSourceLanguage(value);
          this.plugin.invalidateTranslations();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Target language")
      .setDesc("The translated detail page will be shown in this language.")
      .addDropdown((dropdown) => {
        for (const option of TARGET_LANGUAGE_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }

        dropdown.setValue(this.plugin.getTargetLanguage());
        dropdown.onChange(async (value) => {
          this.plugin.settings.targetLanguage = this.plugin.normalizeTargetLanguage(value);
          this.plugin.invalidateTranslations();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Request timeout")
      .setDesc("Timeout in milliseconds. Default: 15000.")
      .addText((text) => {
        text.setPlaceholder("15000");
        text.setValue(String(this.plugin.settings.requestTimeoutMs));
        text.onChange(async (value) => {
          const parsed = Number(value);
          this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 1000 ? parsed : 15000;
          await this.plugin.saveSettings();
        });
      });
  }
}
