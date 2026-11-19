SetCompressorDictSize 64

!macro NSIS_HOOK_POSTINSTALL
  ; 清理旧版无指纹文件名，避免升级安装时继续命中 Windows 图标缓存
  Delete "$INSTDIR\icons\readsoul-md.ico"

  ; 将 ReadSoul 的 Markdown 关联文件图标应用到系统文件关联与“打开方式”
  WriteRegStr SHELL_CONTEXT "Software\Classes\ReadSoul.Markdown\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"

  ReadRegStr $R1 SHELL_CONTEXT "Software\Classes\.md" ""
  ${If} $R1 == ""
    StrCpy $R1 "ReadSoul.Markdown"
    WriteRegStr SHELL_CONTEXT "Software\Classes\.md" "" "$R1"
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\Classes\$R1\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "$R1" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "ReadSoul.Markdown" ""

  ReadRegStr $R2 SHELL_CONTEXT "Software\Classes\.markdown" ""
  ${If} $R2 == ""
    StrCpy $R2 "ReadSoul.Markdown"
    WriteRegStr SHELL_CONTEXT "Software\Classes\.markdown" "" "$R2"
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\Classes\$R2\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "$R2" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "ReadSoul.Markdown" ""

  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".md" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  ; 若系统为所有用户安装 (HKLM)，同步更新 HKCU 残留键以免 HKCU 遮蔽 HKLM 新图标
  ReadRegStr $R3 HKCU "Software\Classes\ReadSoul.Markdown" ""
  ${If} $R3 != ""
    WriteRegStr HKCU "Software\Classes\ReadSoul.Markdown\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"
  ${EndIf}
  ReadRegStr $R4 HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" ""
  ${If} $R4 != ""
    WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$\"$INSTDIR\icons\readsoul-md-fc83efb6.ico$\",0"
  ${EndIf}

  !insertmacro UPDATEFILEASSOC
  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
    ExecWait '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
    ${EnableX64FSRedirection}
  ${Else}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
    ExecWait '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "ReadSoul.Markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "ReadSoul.Markdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  !insertmacro UPDATEFILEASSOC
  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
    ${EnableX64FSRedirection}
  ${Else}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
  ${EndIf}
!macroend
