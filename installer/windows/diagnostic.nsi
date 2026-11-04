Unicode true
Target amd64-unicode
Name "Diagnóstico VR - Busca Preço"
OutFile "${OUTPUT}/DiagnosticoVR.exe"
RequestExecutionLevel admin
SilentInstall silent
AutoCloseWindow true
!include "LogicLib.nsh"
Section
  SetShellVarContext all
  SetRegView 64
  StrCpy $0 "$PROGRAMFILES64\BuscaPrecoIntegrador"
  StrCpy $1 "$APPDATA\BuscaPrecoIntegrador"
  IfFileExists "$0\runtime\node.exe" found
    MessageBox MB_OK|MB_ICONSTOP "O integrador completo não foi encontrado neste computador."
    SetErrorLevel 1
    Quit
  found:
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=diagnostico-vr.mjs "${SOURCE}/installer/windows/diagnostic.mjs"
  nsExec::ExecToStack '"$0\runtime\node.exe" "$PLUGINSDIR\diagnostico-vr.mjs" "$0" "$1"'
  Pop $2
  Pop $3
  ${If} $2 != 0
    MessageBox MB_OK|MB_ICONSTOP "Não foi possível executar o diagnóstico. Verifique a instalação e execute como administrador."
    SetErrorLevel 1
    Quit
  ${EndIf}
  ExecShell "open" "$SYSDIR\notepad.exe" '$\"$1\logs\diagnostico-vr.txt$\"'
SectionEnd
