// ReadSoul 简体中文固定词条库（已清除多语言动态切换与外部运行时）

export interface Messages {
  fBody(): string;
  fTrySavingAgainYourTextIsStillHere(): string;
  fAddAHeadingToSeeTheOutlineHere(): string;
  fADocumentWaitingToBegin(): string;
  fConfirmRemoval(): string;
  fRemoveFromRecentDocuments(): string;
  fNoDocumentsFound(): string;
  fFinishComposingYourTextFirst(): string;
  fChooseAgainWithin3SecondsToRemove(): string;
  fRemovedFromRecentDocumentsTheFileIsUnchanged(): string;
  fRemovedTheDraftStaysInTheTrashFolderFor(): string;
  fTheImageExceeds20MB(): string;
  fTheImageCouldNotBeRead(): string;
  fTheDocumentChangedInsertTheImageAgain(): string;
  fPastedImage(): string;
  fEditingIsUnavailableInReadingModePressRTo(shortcut: string): string;
  fImage(): string;
  fMarkdownDownloadedUseExportToIncludeImages(): string;
  fTextDownloadedImagesRemainOnThisMac(): string;
  fDocumentArchiveDownloaded(): string;
  fMissingImageReferencesPreserved(): string;
  fExternalImagesNeedAnInternetConnection(): string;
  fExportTheCompleteFormattedDocument(): string;
  fCopyTheTextAndBasicFormatting(): string;
  fDownloadHTMLWithLocalImagesEmbedded(): string;
  fMissingImagesWillShowANote(): string;
  fExternalImagesRemainAsLinks(): string;
  fCopyRichText(): string;
  fPrintSaveAsPDF(): string;
  fDownloadHTML(): string;
  fRichTextCopiedImageSupportDependsOnTheReceiving(): string;
  fFinishComposingYourTextToSaveAndQuit(): string;
  fYourDocumentIsSavedLocallyYouCanCloseThis(): string;
  fNewDocument(): string;
  fSaveAs(): string;
  fDocumentAndImagesZIP(): string;
  fExportPDF(): string;
  fRecentDocuments(): string;
  fOutline(): string;
  fFindInDocument(): string;
  fHeading1(): string;
  fHeading2(): string;
  fHeading3(): string;
  fStrikethrough(): string;
  fInlineCode(): string;
  fBulletedList(): string;
  fNumberedList(): string;
  fUndo(): string;
  fRedo(): string;
  fUseSaveAsToGiveAnExistingFileA(): string;
  fUntitledDocument(): string;
  fHeadingNotFound(): string;
  fThisTypeOfLinkIsNotSupported(): string;
  fTheDocumentChangedReopenTheEditingPanel(): string;
  fNote(): string;
  fBold(): string;
  fItalic(): string;
  fBlockquote(): string;
  fTaskList(): string;
  fLink(): string;
  fTable(): string;
  fCodeBlock(): string;
  fLoadedTheLatestVersionFromDisk(): string;
  fTheImageCouldNotBeDecoded(): string;
  fTheImageTookTooLongToLoad(): string;
  fClipboardUnavailableDownloadHTMLInstead(): string;
  fEnterAnHttpsHttpMailtoOrHeadingLink(): string;
  fATableNeedsAtLeastOneColumn(): string;
  fMarkAsIncomplete(): string;
  fMarkAsComplete(): string;
  fCtrlClickToOpenTheLink(shortcut: string): string;
  fStartWithASentence(): string;
  fDocumentText(): string;
  fComplete(): string;
  fIncomplete(): string;
  fTip(): string;
  fImportant(): string;
  fWarning(): string;
  fCaution(): string;
  fExternalImage(): string;
  fViewOnline(): string;
  fViewImage(): string;
  fMissingImage(): string;
  fUnreadableImage(): string;
  fDocumentProperties(): string;
  fTheLocalServiceIsUnavailableKeepThisWindowOpen(): string;
  fEdit(): string;
  fSplit(): string;
  fRead(): string;
  fSettingsTitle(): string;
  fExportPDFHTMLZIPOrCopyRichText(): string;
  fExport2(): string;
  fHeadingLevel(): string;
  fRetrySave(): string;
  fViewDiskVersion(): string;
  fOverwriteWithCurrentVersion(): string;
  fEditor(): string;
  fFormat(): string;
  fDocumentEditor(): string;
  f0Words(): string;
  fReadingPreview(): string;
  fReadingView(): string;
  fReadOnly(): string;
  fCloseSidebar(): string;
  fOpenLocalMarkdown(): string;
  fCloseAppearance(): string;
  fTheme(): string;
  fFollowSystem(): string;
  fFontSize(): string;
  fBodyFontSize(): string;
  fLineWidth(): string;
  fBodyLineWidth(): string;
  fComfortable(): string;
  fWide(): string;
  fFullWidth(): string;
  fNameDraft(): string;
  fGiveThisPageAName(): string;
  fDocumentName(): string;
  fCancel(): string;
  fSaveName(): string;
  fDocumentNotSaved(): string;
  fSaveThisPageFirst(): string;
  fYourLatestChangesHaveNotBeenSavedToThe(): string;
  fKeepEditing(): string;
  fRetryAndQuit(): string;
  fSaveACopy(): string;
  fDiscardChangesAndQuit(): string;
  fMissingImages(): string;
  fSomeImagesCouldNotBeFound(): string;
  fGoBack(): string;
  fExportWithOriginalReferences(): string;
  fEditLink(): string;
  fCloseLinkPanel(): string;
  fDisplayText(): string;
  fLinkText(): string;
  fLinkURL(): string;
  fHttpsOrHeading(): string;
  fOpenLink(): string;
  fRemoveLink(): string;
  fApplyLink(): string;
  fExportThisPage(): string;
  fCloseExportPanel(): string;
  fSaveMarkdown(): string;
  fAStandardMdFileForFurtherEditing(): string;
  fIncludeLocalImages(): string;
  fFullyFormattedForReadingAndSharing(): string;
  fPasteIntoEmailOrDocumentsWithBasicFormatting(): string;
  fEmbeddedLocalImagesForOfflineReading(): string;
  fExternalImagesRemainAsLinksRichTextImageSupport(): string;
  fDocumentReady(): string;
  fYourDocumentIsReady(): string;
  fBackToEditing(): string;
  fContinue(): string;
  bStatusDraftSaved(): string;
  bStatusFileSaved(): string;
  bStatusFileUnavailable(): string;
  bStatusDiskUnreadable(): string;
  bStatusDiskReloaded(): string;
  bStatusReloadRecoveryFailed(): string;
  bStatusDiskConflict(): string;
  bStatusImageSaveFailed(): string;
  bStatusFileSaveFailed(): string;
  bStatusSaveFailed(): string;
  bStatusRecoveryUpdateFailed(): string;
  bDocumentMissing(): string;
  bDocumentChanged(): string;
  bInvalidDocument(): string;
  bDiskChanged(): string;
  bUnknownTheme(): string;
  bUnknownAutoSwitch(): string;
  bInvalidFontSize(): string;
  bUnknownLineWidth(): string;
  bUnknownLayout(): string;
  bNameRequired(): string;
  bRenameExistingFile(): string;
  bImageTooLarge(): string;
  bUnsupportedImage(): string;
  bImageNotReferenced(): string;
  bUntitled(): string;
  bRecoverySuffix(): string;
  bDiskVersionSuffix(): string;
  bCorruptDrafts(count: number): string;
  bShortcutUnavailable(shortcut: string): string;
  bImageUnreadable(path: string): string;
  bOpenFailed(name: string, error: string): string;
  fHeading(level: number): string;
  fWordCount(count: number): string;
  fSaveError(error: string): string;
  fPreferencesError(error: string): string;
  fRecoveryFilename(title: string): string;
  fClipboardError(error: string): string;
  fOverwritten(title: string): string;
  fTableHeaderCell(column: number): string;
  fScrollableTable(table: string): string;
  fScrollableContent(content: string): string;
  fTableCell(row: number, column: number): string;
  fDocumentOpenError(error: string): string;
  fImageTemporarilyUnreadable(alt: string): string;
  fImageResourceMissing(alt: string): string;
  fFind(): string;
  fFindNoMatches(): string;
  fFindInvalidRegexp(): string;
  fReplace(): string;
  fNext(): string;
  fPrevious(): string;
  fAll(): string;
  fMatchCase(): string;
  fRegexp(): string;
  fWholeWord(): string;
  fReplaceAll(): string;
  fClose(): string;
  fFindLabel(): string;
  fReplaceLabel(): string;
  fGoToLine(): string;
  fGo(): string;
  fCurrentMatch(): string;
  fOnLine(): string;
  fReplacedOnLine(line: string): string;
  fReplacements(count: string): string;
  bStatusFileReadOnly(): string;
  fBlockActions(): string;
  fBlockGrip(): string;
  fInsertParagraphBelow(): string;
  fConvertBlockTo(): string;
  fDuplicateBlock(): string;
  fDeleteBlock(): string;
  fMoveBlockUp(): string;
  fMoveBlockDown(): string;
  fInsertBlock(): string;
  fHorizontalRule(): string;
  fCallout(): string;
  fTableActions(): string;
  fInsertRowAbove(): string;
  fInsertRowBelow(): string;
  fInsertColumnLeft(): string;
  fInsertColumnRight(): string;
  fDeleteRow(): string;
  fDeleteColumn(): string;
  fAlignColumnLeft(): string;
  fAlignColumnCenter(): string;
  fAlignColumnRight(): string;
  fDeleteTable(): string;
  fUnderline(): string;
  fHighlight(): string;
  fSuperscript(): string;
  fSubscript(): string;
  fClearFormatting(): string;
  fOutdent(): string;
  fIndent(): string;
  fInsert(): string;
  fHeading4(): string;
  fHeading5(): string;
  fHeading6(): string;
  fImageActions(): string;
  fResizeImage(): string;
  fImageOriginalSize(): string;
  fImageAlt(): string;
  fDeleteImage(): string;
  fFormula(): string;
  fFormulaUnsupported(): string;
  fDiagram(): string;
  fDiagramLoading(): string;
  fDiagramError(error: string): string;
  fDiagramStart(): string;
  fDiagramEnd(): string;
  fFootnote(): string;
  fDetails(): string;
  fDetailsTitle(): string;
  fDetailsContent(): string;
  fCollapseDetails(): string;
  fExpandDetails(): string;
  fWordDocument(): string;
  fWordDescription(): string;
  fDownloadWordDocument(): string;
  fSwitchAutomatically(): string;
  fOff(): string;
  bCaptureInvalidTags(): string;
  bSearchInvalidQuery(): string;
  bSearchQueryTooLong(): string;
  bSearchQueryLineBreak(): string;
  fSearchDocuments(): string;
  fSearching(): string;
  fSearchCount(count: number): string;
  fSearchEmpty(query: string): string;
  fSearchTruncated(): string;
  fSearchMoreHits(): string;
  fSearchDraft(): string;
  fSearchLine(line: number): string;
  fSearchRetry(): string;
  fSearchPending(): string;
  fSearchSaveFailed(): string;
  fSearchStale(): string;
  fSearchRemoved(): string;
  bFilterInvalidTag(): string;
  fTagFilter(): string;
  fAllTags(): string;
  fDocuments(): string;
  fTagCount(tag: string, count: number): string;
  fFilterTag(tag: string): string;
  fClearTag(tag: string): string;
  fMoreTags(count: number): string;
  fTagEmpty(tag: string): string;
  bWikiInvalidName(): string;
  bWikiSourceChanged(): string;
  bWikiSourceMissing(): string;
  fWikiChoose(): string;
  fWikiChooseNote(): string;
  fWikiMissing(title: string): string;
}

const zhMessages: Messages = {
  fBody: () => "正文",
  fTrySavingAgainYourTextIsStillHere: () => "请先重试保存，当前输入仍保留",
  fAddAHeadingToSeeTheOutlineHere: () => "输入 # 标题后，大纲会出现在这里。",
  fADocumentWaitingToBegin: () => "一篇等待开始的文稿",
  fConfirmRemoval: () => "确认移除",
  fRemoveFromRecentDocuments: () => "从最近文稿移除",
  fNoDocumentsFound: () => "没有找到这篇文稿。",
  fFinishComposingYourTextFirst: () => "请先确认输入法候选",
  fChooseAgainWithin3SecondsToRemove: () => "3 秒内再选一次以确认移除",
  fRemovedFromRecentDocumentsTheFileIsUnchanged: () => "已从最近文稿移除，磁盘文件未改动",
  fRemovedTheDraftStaysInTheTrashFolderFor: () => "已移除，草稿在废纸篓目录保留 30 天",
  fTheImageExceeds20MB: () => "图片超过 20 MB",
  fTheImageCouldNotBeRead: () => "图片无法读取",
  fTheDocumentChangedInsertTheImageAgain: () => "文稿已切换，请重新插入",
  fPastedImage: () => "粘贴图片",
  fEditingIsUnavailableInReadingModePressRTo: (shortcut: string) => `阅读模式下不能编辑，${shortcut ?? ""} 返回编辑`,
  fImage: () => "图片",
  fMarkdownDownloadedUseExportToIncludeImages: () => "浏览器已下载 Markdown；含图片请使用“导出”",
  fTextDownloadedImagesRemainOnThisMac: () => "当前正文已下载；图片仍保留在本机",
  fDocumentArchiveDownloaded: () => "文稿包已下载",
  fMissingImageReferencesPreserved: () => " · 保留了缺失图片引用",
  fExternalImagesNeedAnInternetConnection: () => " · 外链图片仍需联网",
  fExportTheCompleteFormattedDocument: () => "将导出整篇排版。",
  fCopyTheTextAndBasicFormatting: () => "复制正文和基本格式。",
  fDownloadHTMLWithLocalImagesEmbedded: () => "下载包含本地图片的 HTML。",
  fMissingImagesWillShowANote: () => " 缺失图片将显示提示。",
  fExternalImagesRemainAsLinks: () => " 外链图片保留为链接。",
  fCopyRichText: () => "复制富文本",
  fPrintSaveAsPDF: () => "打印 / 另存为 PDF",
  fDownloadHTML: () => "下载 HTML",
  fRichTextCopiedImageSupportDependsOnTheReceiving: () => "已复制富文本；图片显示取决于接收应用",
  fFinishComposingYourTextToSaveAndQuit: () => "请先确认输入法候选，完成后会保存并退出",
  fYourDocumentIsSavedLocallyYouCanCloseThis: () => "文稿已保存在本地，可以关闭此页面",
  fNewDocument: () => "新建文稿",
  fSaveAs: () => "另存为…",
  fDocumentAndImagesZIP: () => "文稿与图片 ZIP",
  fExportPDF: () => "导出 PDF",
  fRecentDocuments: () => "最近文稿",
  fOutline: () => "大纲",
  fFindInDocument: () => "查找正文",
  fHeading1: () => "标题 1",
  fHeading2: () => "标题 2",
  fHeading3: () => "标题 3",
  fStrikethrough: () => "删除线",
  fInlineCode: () => "行内代码",
  fBulletedList: () => "无序列表",
  fNumberedList: () => "有序列表",
  fUndo: () => "撤销",
  fRedo: () => "重做",
  fUseSaveAsToGiveAnExistingFileA: () => "已有文件可通过“另存为”设置新名称",
  fUntitledDocument: () => "未命名文稿",
  fHeadingNotFound: () => "没有找到这个标题",
  fThisTypeOfLinkIsNotSupported: () => "不支持打开此类链接",
  fTheDocumentChangedReopenTheEditingPanel: () => "文稿已变化，请重新打开编辑面板",
  fNote: () => "说明",
  fBold: () => "加粗",
  fItalic: () => "斜体",
  fBlockquote: () => "引用",
  fTaskList: () => "任务列表",
  fLink: () => "链接",
  fTable: () => "表格",
  fCodeBlock: () => "代码块",
  fLoadedTheLatestVersionFromDisk: () => "已载入磁盘上的新版本",
  fTheImageCouldNotBeDecoded: () => "图片无法解码",
  fTheImageTookTooLongToLoad: () => "图片加载超时",
  fClipboardUnavailableDownloadHTMLInstead: () => "剪贴板不可用，请下载 HTML",
  fEnterAnHttpsHttpMailtoOrHeadingLink: () => "请输入 https://、http://、mailto: 或 #标题 链接",
  fATableNeedsAtLeastOneColumn: () => "表格至少需要一列",
  fMarkAsIncomplete: () => "标记为未完成",
  fMarkAsComplete: () => "标记为已完成",
  fCtrlClickToOpenTheLink: (shortcut: string) => `${shortcut ?? ""} 点击打开链接`,
  fStartWithASentence: () => "从一句话开始……",
  fDocumentText: () => "文稿正文",
  fComplete: () => "已完成",
  fIncomplete: () => "未完成",
  fTip: () => "提示",
  fImportant: () => "重要",
  fWarning: () => "警告",
  fCaution: () => "注意",
  fExternalImage: () => "外链图片",
  fViewOnline: () => "（联网查看）",
  fViewImage: () => "查看图片",
  fMissingImage: () => "图片缺失：",
  fUnreadableImage: () => "图片无法读取：",
  fDocumentProperties: () => "文稿属性",
  fTheLocalServiceIsUnavailableKeepThisWindowOpen: () => "本地服务暂时不可用，请保留当前窗口",
  fEdit: () => "编辑",
  fSplit: () => "分栏",
  fRead: () => "阅读",
  fSettingsTitle: () => "设置",
  fExportPDFHTMLZIPOrCopyRichText: () => "导出 PDF、HTML、ZIP 或复制富文本",
  fExport2: () => "导出",
  fHeadingLevel: () => "标题级别",
  fRetrySave: () => "重试保存",
  fViewDiskVersion: () => "查看磁盘版本",
  fOverwriteWithCurrentVersion: () => "用当前版本覆盖",
  fEditor: () => "编辑区",
  fFormat: () => "格式",
  fDocumentEditor: () => "文稿编辑区",
  f0Words: () => "0 字",
  fReadingPreview: () => "阅读预览",
  fReadingView: () => "阅读视图",
  fReadOnly: () => "只读",
  fCloseSidebar: () => "关闭侧栏",
  fOpenLocalMarkdown: () => "打开本地 Markdown",
  fCloseAppearance: () => "关闭外观",
  fTheme: () => "主题",
  fFollowSystem: () => "跟随系统",
  fFontSize: () => "字号",
  fBodyFontSize: () => "正文字号",
  fLineWidth: () => "行宽",
  fBodyLineWidth: () => "正文行宽",
  fComfortable: () => "舒适",
  fWide: () => "宽阔",
  fFullWidth: () => "全宽",
  fNameDraft: () => "为草稿命名",
  fGiveThisPageAName: () => "给这一页一个名字",
  fDocumentName: () => "文稿名称",
  fCancel: () => "取消",
  fSaveName: () => "保存名称",
  fDocumentNotSaved: () => "文稿保存未完成",
  fSaveThisPageFirst: () => "先把这一页留住",
  fYourLatestChangesHaveNotBeenSavedToThe: () => "最新修改还没有保存到草稿，当前内容仍在编辑器里。",
  fKeepEditing: () => "继续编辑",
  fRetryAndQuit: () => "重试并退出",
  fSaveACopy: () => "保存当前副本",
  fDiscardChangesAndQuit: () => "放弃未保存修改并退出",
  fMissingImages: () => "图片缺失",
  fSomeImagesCouldNotBeFound: () => "有几张图片没有找到",
  fGoBack: () => "返回处理",
  fExportWithOriginalReferences: () => "保留原引用继续导出",
  fEditLink: () => "编辑链接",
  fCloseLinkPanel: () => "关闭链接面板",
  fDisplayText: () => "显示文字",
  fLinkText: () => "链接文字",
  fLinkURL: () => "链接地址",
  fHttpsOrHeading: () => "https:// 或 #标题",
  fOpenLink: () => "打开链接",
  fRemoveLink: () => "移除链接",
  fApplyLink: () => "应用链接",
  fExportThisPage: () => "导出这一页",
  fCloseExportPanel: () => "关闭导出面板",
  fSaveMarkdown: () => "保存 Markdown",
  fAStandardMdFileForFurtherEditing: () => "普通 .md 文件，继续编辑",
  fIncludeLocalImages: () => "连同本地图片一起导出",
  fFullyFormattedForReadingAndSharing: () => "完整排版，适合阅读与发送",
  fPasteIntoEmailOrDocumentsWithBasicFormatting: () => "粘贴到邮件或文档，保留基本格式",
  fEmbeddedLocalImagesForOfflineReading: () => "内嵌本地图片，离线阅读",
  fExternalImagesRemainAsLinksRichTextImageSupport: () => "外链图片保留链接；富文本图片显示取决于接收应用。",
  fDocumentReady: () => "文稿已准备",
  fYourDocumentIsReady: () => "文稿已准备好",
  fBackToEditing: () => "返回编辑",
  fContinue: () => "继续",
  bStatusDraftSaved: () => "草稿已保存",
  bStatusFileSaved: () => "文件已保存",
  bStatusFileUnavailable: () => "文件不可访问，草稿已保留",
  bStatusDiskUnreadable: () => "磁盘文件无法读取，草稿已保留",
  bStatusDiskReloaded: () => "已载入磁盘上的新版本",
  bStatusReloadRecoveryFailed: () => "已载入磁盘新版本，恢复记录更新失败",
  bStatusDiskConflict: () => "磁盘内容已变化，自动写入已暂停",
  bStatusImageSaveFailed: () => "草稿已保留，图片保存失败",
  bStatusFileSaveFailed: () => "草稿已保留，文件保存失败",
  bStatusSaveFailed: () => "保存失败，内容仍在编辑器",
  bStatusRecoveryUpdateFailed: () => "文件已保存，恢复记录更新失败",
  bDocumentMissing: () => "文稿不存在",
  bDocumentChanged: () => "文稿已变化，请重新载入，当前输入尚未保存",
  bInvalidDocument: () => "文稿超过 8 MB 或编码无效",
  bDiskChanged: () => "磁盘文件已变化",
  bUnknownTheme: () => "未知主题",
  bUnknownAutoSwitch: () => "未知的自动切换方式",
  bInvalidFontSize: () => "字号应为 15 至 22",
  bUnknownLineWidth: () => "未知行宽",
  bUnknownLayout: () => "未知布局",
  bNameRequired: () => "请输入名称",
  bRenameExistingFile: () => "已有文件请通过另存命名",
  bImageTooLarge: () => "图片超过 20 MB",
  bUnsupportedImage: () => "请选择 PNG、JPEG、GIF、WebP、SVG、AVIF 或 BMP 图片，最长边不超过 16000 像素",
  bImageNotReferenced: () => "图片未被文稿引用",
  bUntitled: () => "未命名文稿",
  bRecoverySuffix: () => " · 恢复副本",
  bDiskVersionSuffix: () => " · 磁盘版本",
  bCorruptDrafts: (count: number) => `有 ${count ?? ""} 份草稿无法读取，已移到隔离目录`,
  bShortcutUnavailable: (shortcut: string) => `快捷键 ${shortcut ?? ""} 已被其他应用占用`,
  bImageUnreadable: (path: string) => `图片缺失或无法读取：${path ?? ""}`,
  bOpenFailed: (name: string, error: string) => `无法打开「${name ?? ""}」：${error ?? ""}`,
  fHeading: (level: number) => `标题 ${level ?? ""}`,
  fWordCount: (count: number) => `${count.toLocaleString("zh-Hans")} 字`,
  fSaveError: (error: string) => `保存失败：${error ?? ""}`,
  fPreferencesError: (error: string) => `本次已应用，偏好未能保存：${error ?? ""}`,
  fRecoveryFilename: (title: string) => `${title ?? ""}-恢复副本.md`,
  fClipboardError: (error: string) => `无法读取剪贴板：${error ?? ""}`,
  fOverwritten: (title: string) => `已用当前版本覆盖磁盘文件；原磁盘内容另存为「${title ?? ""} · 磁盘版本」`,
  fTableHeaderCell: (column: number) => `表头 第${column ?? ""}列`,
  fScrollableTable: (table: string) => `${table ?? ""}，可左右滚动`,
  fScrollableContent: (content: string) => `${content ?? ""}，可左右滚动`,
  fTableCell: (row: number, column: number) => `第${row ?? ""}行 第${column ?? ""}列`,
  fDocumentOpenError: (error: string) => `无法打开文稿：${error ?? ""}`,
  fImageTemporarilyUnreadable: (alt: string) => `图片暂时无法读取 · ${alt ?? ""}`,
  fImageResourceMissing: (alt: string) => `图片资源缺失 · ${alt ?? ""}`,
  fFind: () => "查找",
  fFindNoMatches: () => "未找到",
  fFindInvalidRegexp: () => "正则表达式无效",
  fReplace: () => "替换",
  fNext: () => "下一个",
  fPrevious: () => "上一个",
  fAll: () => "全部",
  fMatchCase: () => "区分大小写",
  fRegexp: () => "正则表达式",
  fWholeWord: () => "全字匹配",
  fReplaceAll: () => "全部替换",
  fClose: () => "关闭",
  fFindLabel: () => "查找：",
  fReplaceLabel: () => "替换：",
  fGoToLine: () => "跳转到行",
  fGo: () => "跳转",
  fCurrentMatch: () => "当前匹配",
  fOnLine: () => "所在行",
  fReplacedOnLine: (line: string) => `已替换第 ${line ?? ""} 行的匹配`,
  fReplacements: (count: string) => `替换次数：${count ?? ""}`,
  bStatusFileReadOnly: () => "文件为只读，修改保留在草稿中",
  fBlockActions: () => "块操作",
  fBlockGrip: () => "选择或拖动块",
  fInsertParagraphBelow: () => "在下方插入段落",
  fConvertBlockTo: () => "转换为",
  fDuplicateBlock: () => "复制一份",
  fDeleteBlock: () => "删除",
  fMoveBlockUp: () => "上移",
  fMoveBlockDown: () => "下移",
  fInsertBlock: () => "插入块",
  fHorizontalRule: () => "分割线",
  fCallout: () => "提示块",
  fTableActions: () => "表格操作",
  fInsertRowAbove: () => "在上方插入行",
  fInsertRowBelow: () => "在下方插入行",
  fInsertColumnLeft: () => "在左侧插入列",
  fInsertColumnRight: () => "在右侧插入列",
  fDeleteRow: () => "删除行",
  fDeleteColumn: () => "删除列",
  fAlignColumnLeft: () => "左对齐",
  fAlignColumnCenter: () => "居中",
  fAlignColumnRight: () => "右对齐",
  fDeleteTable: () => "删除表格",
  fUnderline: () => "下划线",
  fHighlight: () => "高亮",
  fSuperscript: () => "上标",
  fSubscript: () => "下标",
  fClearFormatting: () => "清除格式",
  fOutdent: () => "减少缩进",
  fIndent: () => "增加缩进",
  fInsert: () => "插入",
  fHeading4: () => "标题 4",
  fHeading5: () => "标题 5",
  fHeading6: () => "标题 6",
  fImageActions: () => "图片操作",
  fResizeImage: () => "调整图片大小",
  fImageOriginalSize: () => "原始大小",
  fImageAlt: () => "说明文字",
  fDeleteImage: () => "删除图片",
  fFormula: () => "公式",
  fFormulaUnsupported: () => "公式含有不支持或不受信任的命令。",
  fDiagram: () => "图表",
  fDiagramLoading: () => "正在绘制图表…",
  fDiagramError: (error: string) => `图表错误：${error ?? ""}`,
  fDiagramStart: () => "开始",
  fDiagramEnd: () => "结束",
  fFootnote: () => "脚注",
  fDetails: () => "折叠块",
  fDetailsTitle: () => "标题",
  fDetailsContent: () => "内容",
  fCollapseDetails: () => "折叠内容",
  fExpandDetails: () => "展开内容",
  fWordDocument: () => "Word 文稿（.docx）",
  fWordDescription: () => "可编辑的 Word 文稿，保留标题、列表、表格、图片、公式和脚注。",
  fDownloadWordDocument: () => "下载 Word 文稿",
  fSwitchAutomatically: () => "自动切换",
  fOff: () => "关",
  bCaptureInvalidTags: () => "最多 32 个标签，每个不超过 80 个字，且不能包含换行。",
  bSearchInvalidQuery: () => "请输入有效的搜索文字。",
  bSearchQueryTooLong: () => "搜索文字最多 128 个字符。",
  bSearchQueryLineBreak: () => "请搜索单行内连续的文字。",
  fSearchDocuments: () => "搜索文稿标题与内容…",
  fSearching: () => "正在搜索…",
  fSearchCount: (count: number) => `找到 ${count ?? ""} 篇文稿`,
  fSearchEmpty: (query: string) => `没有找到包含「${query ?? ""}」的文稿。`,
  fSearchTruncated: () => "显示前 100 篇，请缩小搜索范围。",
  fSearchMoreHits: () => "还有更多匹配，可在文内继续查找。",
  fSearchDraft: () => "草稿",
  fSearchLine: (line: number) => `第 ${line ?? ""} 行`,
  fSearchRetry: () => "重试搜索",
  fSearchPending: () => "当前修改自动保存后会更新结果。",
  fSearchSaveFailed: () => "结果暂不包含当前未保存的修改。",
  fSearchStale: () => "文稿内容已更新，请重新选择搜索结果。",
  fSearchRemoved: () => "文稿已移除。",
  bFilterInvalidTag: () => "请输入有效标签，最多 80 个字，且不能包含控制字符。",
  fTagFilter: () => "标签筛选",
  fAllTags: () => "全部标签",
  fDocuments: () => "文稿",
  fTagCount: (tag: string, count: number) => `${tag ?? ""} · ${count ?? ""}`,
  fFilterTag: (tag: string) => `筛选标签「${tag ?? ""}」`,
  fClearTag: (tag: string) => `清除标签筛选「${tag ?? ""}」`,
  fMoreTags: (count: number) => `+${count ?? ""} 个标签`,
  fTagEmpty: (tag: string) => `没有带「${tag ?? ""}」标签的文稿。`,
  bWikiInvalidName: () => "引用名称无效，请使用单行标题，最多 256 个字，且不能包含控制字符、方括号或竖线。",
  bWikiSourceChanged: () => "来源文稿已更新，请重新点击引用。",
  bWikiSourceMissing: () => "来源文稿已移除。",
  fWikiChoose: () => "选择引用的文稿",
  fWikiChooseNote: () => "有多篇文稿使用相同标题，请选择要打开的一篇。",
  fWikiMissing: (title: string) => `没有找到标题为「${title ?? ""}」的已登记文稿。`,
};

export const messages: Messages = zhMessages;
