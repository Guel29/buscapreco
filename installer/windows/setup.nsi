Unicode true
Target amd64-unicode
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

Name "Busca Preço - Integrador VR"
OutFile "${OUTPUT}/BuscaPrecoIntegrador-Setup.exe"
InstallDir "$PROGRAMFILES64\BuscaPrecoIntegrador"
RequestExecutionLevel admin
SetCompressor zlib
VIProductVersion "1.0.1.0"
VIAddVersionKey "ProductName" "Busca Preço - Integrador VR"
VIAddVersionKey "FileDescription" "Instalador do integrador VR/PostgreSQL"
VIAddVersionKey "FileVersion" "1.0.1"

Var DataDir
Var Dialog
Var UrlBox
Var TokenBox
Var StoreBox
Var IntervalBox
Var StartupBox
Var KeepBox
Var KeepConfig
Var StartAtBoot
Var HostBox
Var PortBox
Var DatabaseBox
Var UserBox
Var PasswordBox
Var SituationBox
Var SSLBox
Var CloudUrl
Var CloudToken
Var Store
Var Interval
Var Host
Var Port
Var Database
Var DbUser
Var DbPassword
Var Situation
Var DbSSL

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Este instalador inclui o runtime e as dependências do integrador VR/PostgreSQL.$\r$\n$\r$\nO integrador será registrado como serviço do Windows e poderá iniciar ao ligar o computador, sem login de usuário e sem abrir o painel.$\r$\n$\r$\nA instalação requer administrador uma vez. O serviço usa a conta restrita LocalService. Tenha os dados de um usuário de leitura do VR e o token da Hostinger."
!insertmacro MUI_PAGE_WELCOME
Page custom CloudPage CloudLeave
Page custom DatabasePage DatabaseLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "Instalação concluída.$\r$\n$\r$\nO serviço iniciará na próxima inicialização do Windows, sem login, se a opção automática foi marcada. O instalador não inicia a carga agora.$\r$\n$\r$\nPara testar antes de reiniciar, abra Serviços do Windows e inicie Busca Preço - Integrador VR. Confira os logs e compare os preços com o VR."
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  SetShellVarContext all
  SetRegView 64
  StrCpy $DataDir "$APPDATA\BuscaPrecoIntegrador"
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Este instalador requer Windows de 64 bits."
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Requer Windows 10/11 ou Windows Server 2019 ou posterior."
    Quit
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 17763 supported tooOld supported
  tooOld:
    MessageBox MB_OK|MB_ICONSTOP "Atualize o Windows para uma versão compatível (build 17763 ou posterior)."
    Quit
  supported:
  StrCpy $KeepConfig ${BST_UNCHECKED}
  StrCpy $StartAtBoot ${BST_CHECKED}
  IfFileExists "$DataDir\config.json" 0 +2
    StrCpy $KeepConfig ${BST_CHECKED}
  ${If} $KeepConfig == ${BST_CHECKED}
    ReadRegDWORD $0 HKLM "SYSTEM\CurrentControlSet\Services\BuscaPrecoIntegradorVR" "Start"
    ${If} $0 == 3
    ${OrIf} $0 == 4
      StrCpy $StartAtBoot ${BST_UNCHECKED}
    ${EndIf}
  ${EndIf}
  IfSilent 0 interactive
    ${If} $KeepConfig != ${BST_CHECKED}
      MessageBox MB_OK|MB_ICONSTOP "A primeira instalação requer configuração interativa." /SD IDOK
      Quit
    ${EndIf}
  interactive:
FunctionEnd

Function CloudPage
  !insertmacro MUI_HEADER_TEXT "Hostinger e inicialização" "Configure a nuvem e escolha se deseja iniciar com o Windows, sem login."
  nsDialogs::Create 1018
  Pop $Dialog
  ${NSD_CreateLabel} 0 0 100% 10u "URL HTTPS do aplicativo na Hostinger"
  Pop $0
  ${NSD_CreateText} 0 12u 100% 13u "$CloudUrl"
  Pop $UrlBox
  ${NSD_CreateLabel} 0 30u 100% 10u "Token do receptor ERP (pelo menos 32 caracteres)"
  Pop $0
  ${NSD_CreatePassword} 0 42u 100% 13u "$CloudToken"
  Pop $TokenBox
  ${NSD_CreateLabel} 0 60u 45% 10u "ID da loja"
  Pop $0
  ${NSD_CreateNumber} 0 72u 45% 13u "$Store"
  Pop $StoreBox
  ${NSD_CreateLabel} 52% 60u 48% 10u "Intervalo (minutos)"
  Pop $0
  ${NSD_CreateNumber} 52% 72u 48% 13u "$Interval"
  Pop $IntervalBox
  ${If} $Store == ""
    ${NSD_SetText} $StoreBox "1"
    ${NSD_SetText} $IntervalBox "10"
  ${EndIf}
  ${NSD_CreateCheckbox} 0 97u 100% 12u "Iniciar como serviço ao ligar o computador, sem login"
  Pop $StartupBox
  ${NSD_SetState} $StartupBox $StartAtBoot
  ${NSD_CreateCheckbox} 0 116u 100% 12u "Manter a configuração existente (atualização/reinstalação)"
  Pop $KeepBox
  ${NSD_SetState} $KeepBox $KeepConfig
  IfFileExists "$DataDir\config.json" +2 0
    EnableWindow $KeepBox 0
  nsDialogs::Show
FunctionEnd

Function CloudLeave
  ${NSD_GetState} $StartupBox $StartAtBoot
  ${NSD_GetState} $KeepBox $KeepConfig
  ${NSD_GetText} $UrlBox $CloudUrl
  ${NSD_GetText} $TokenBox $CloudToken
  ${NSD_GetText} $StoreBox $Store
  ${NSD_GetText} $IntervalBox $Interval
  ${If} $KeepConfig != ${BST_CHECKED}
    StrLen $0 $CloudToken
    ${If} $0 < 32
      MessageBox MB_OK|MB_ICONEXCLAMATION "Informe um token com pelo menos 32 caracteres."
      Abort
    ${EndIf}
    StrCpy $0 $CloudUrl 8
    ${If} $0 != "https://"
      MessageBox MB_OK|MB_ICONEXCLAMATION "A URL precisa começar com https://."
      Abort
    ${EndIf}
    ${If} $Store < 1
    ${OrIf} $Interval < 1
      MessageBox MB_OK|MB_ICONEXCLAMATION "Loja e intervalo precisam ser maiores que zero."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function DatabasePage
  ${If} $KeepConfig == ${BST_CHECKED}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "PostgreSQL do VR" "Use um usuário limitado a leitura; não abra o banco na Internet."
  nsDialogs::Create 1018
  Pop $Dialog
  ${NSD_CreateLabel} 0 0 68% 10u "Servidor PostgreSQL"
  Pop $0
  ${NSD_CreateText} 0 12u 68% 13u "$Host"
  Pop $HostBox
  ${NSD_CreateLabel} 73% 0 27% 10u "Porta"
  Pop $0
  ${NSD_CreateNumber} 73% 12u 27% 13u "$Port"
  Pop $PortBox
  ${NSD_CreateLabel} 0 31u 100% 10u "Nome do banco de dados"
  Pop $0
  ${NSD_CreateText} 0 43u 100% 13u "$Database"
  Pop $DatabaseBox
  ${NSD_CreateLabel} 0 62u 47% 10u "Usuário de leitura"
  Pop $0
  ${NSD_CreateText} 0 74u 47% 13u "$DbUser"
  Pop $UserBox
  ${NSD_CreateLabel} 52% 62u 48% 10u "Senha do PostgreSQL"
  Pop $0
  ${NSD_CreatePassword} 52% 74u 48% 13u "$DbPassword"
  Pop $PasswordBox
  ${NSD_CreateLabel} 0 94u 48% 10u "Situação ATIVA no VR (confirme com o suporte)"
  Pop $0
  ${NSD_CreateNumber} 0 116u 30% 13u "$Situation"
  Pop $SituationBox
  ${NSD_CreateCheckbox} 45% 116u 55% 13u "PostgreSQL usa TLS com certificado válido"
  Pop $SSLBox
  ${NSD_SetState} $SSLBox $DbSSL
  ${If} $Host == ""
    ${NSD_SetText} $HostBox "127.0.0.1"
    ${NSD_SetText} $PortBox "5432"
    ${NSD_SetText} $DatabaseBox "vr"
    ${NSD_SetText} $SituationBox "3"
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function DatabaseLeave
  ${NSD_GetText} $HostBox $Host
  ${NSD_GetText} $PortBox $Port
  ${NSD_GetText} $DatabaseBox $Database
  ${NSD_GetText} $UserBox $DbUser
  ${NSD_GetText} $PasswordBox $DbPassword
  ${NSD_GetText} $SituationBox $Situation
  ${NSD_GetState} $SSLBox $DbSSL
  ${If} $Host == ""
  ${OrIf} $Database == ""
  ${OrIf} $DbUser == ""
  ${OrIf} $DbPassword == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Preencha servidor, banco, usuário e senha."
    Abort
  ${EndIf}
FunctionEnd

Section "Instalar integrador"
  SetShellVarContext all
  IfFileExists "$INSTDIR\BuscaPrecoIntegradorServico.exe" 0 stopped
    nsExec::ExecToStack '"$INSTDIR\BuscaPrecoIntegradorServico.exe" --stop-service'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "Não foi possível parar a instalação anterior. Pare o integrador antes de atualizar." /SD IDOK
    SetErrorLevel 1
      Abort
    ${EndIf}
    Sleep 1000
  stopped:
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}/app/*"
  File "${SERVICE}"
  SetOutPath "$INSTDIR\runtime"
  File "${PAYLOAD}/runtime/node.exe"
  File "${PAYLOAD}/runtime/LICENSE"
  SetOutPath "$INSTDIR"
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-5-19:(OI)(CI)RX"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Não foi possível permitir a leitura dos arquivos pelo serviço." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  CreateDirectory "$DataDir"
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$DataDir" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-19:(OI)(CI)M"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Não foi possível proteger a pasta de configuração. Instalação interrompida." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  CreateDirectory "$DataDir\logs"
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$DataDir\logs" /grant "*S-1-5-32-545:(OI)(CI)RX"'
  Pop $0
  Pop $1
  ${If} $KeepConfig != ${BST_CHECKED}
    InitPluginsDir
    FileOpen $0 "$PLUGINSDIR\config-input.tmp" w
    FileWriteUTF16LE /BOM $0 "$CloudUrl$\r$\n"
    FileWriteUTF16LE $0 "$CloudToken$\r$\n"
    FileWriteUTF16LE $0 "$Store$\r$\n"
    FileWriteUTF16LE $0 "$Interval$\r$\n"
    FileWriteUTF16LE $0 "$Host$\r$\n"
    FileWriteUTF16LE $0 "$Port$\r$\n"
    FileWriteUTF16LE $0 "$Database$\r$\n"
    FileWriteUTF16LE $0 "$DbUser$\r$\n"
    FileWriteUTF16LE $0 "$DbPassword$\r$\n"
    FileWriteUTF16LE $0 "$Situation$\r$\n"
    ${If} $DbSSL == ${BST_CHECKED}
      FileWriteUTF16LE $0 "true$\r$\n"
    ${Else}
      FileWriteUTF16LE $0 "false$\r$\n"
    ${EndIf}
    FileClose $0
    nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\configure-windows.mjs" "$PLUGINSDIR\config-input.tmp" "$DataDir"'
    Pop $0
    Pop $1
    StrCpy $CloudToken ""
    StrCpy $DbPassword ""
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "Não foi possível validar a configuração. Nenhuma inicialização automática foi adicionada. Execute novamente o instalador e confira os dados." /SD IDOK
    SetErrorLevel 1
      Abort
    ${EndIf}
  ${EndIf}
  ${If} $StartAtBoot == ${BST_CHECKED}
    StrCpy $0 "auto"
  ${Else}
    StrCpy $0 "demand"
  ${EndIf}
  nsExec::ExecToStack '"$INSTDIR\BuscaPrecoIntegradorServico.exe" --install-service $0'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Não foi possível registrar o serviço (Windows $0). Execute o instalador como administrador." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  CreateDirectory "$SMPROGRAMS\Busca Preço Integrador VR"
  CreateShortcut "$SMPROGRAMS\Busca Preço Integrador VR\Serviços do Windows.lnk" "$SYSDIR\mmc.exe" '"$SYSDIR\services.msc"'
  CreateShortcut "$SMPROGRAMS\Busca Preço Integrador VR\Ver logs.lnk" "$SYSDIR\notepad.exe" '$\"$DataDir\logs\integrador.log$\"'
  CreateShortcut "$SMPROGRAMS\Busca Preço Integrador VR\Editar configuração (administrador).lnk" "$SYSDIR\notepad.exe" '$\"$DataDir\config.json$\"'
  CreateShortcut "$SMPROGRAMS\Busca Preço Integrador VR\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BuscaPrecoIntegrador" "DisplayName" "Busca Preço - Integrador VR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BuscaPrecoIntegrador" "DisplayVersion" "1.0.1"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BuscaPrecoIntegrador" "UninstallString" '$\"$INSTDIR\Desinstalar.exe$\"'
SectionEnd

Function un.onInit
  SetShellVarContext all
  SetRegView 64
  StrCpy $DataDir "$APPDATA\BuscaPrecoIntegrador"
FunctionEnd

Section "Uninstall"
  SetShellVarContext all
  nsExec::ExecToStack '"$INSTDIR\BuscaPrecoIntegradorServico.exe" --remove-service'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Pare o integrador antes de desinstalar." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  Sleep 1000
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BuscaPrecoIntegrador"
  RMDir /r "$SMPROGRAMS\Busca Preço Integrador VR"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\node_modules"
  Delete "$INSTDIR\integrador.mjs"
  Delete "$INSTDIR\runtime.mjs"
  Delete "$INSTDIR\configure-windows.mjs"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\package-lock.json"
  Delete "$INSTDIR\config.example.json"
  Delete "$INSTDIR\build-information.json"
  Delete "$INSTDIR\LEIA-ME.txt"
  Delete "$INSTDIR\BuscaPrecoIntegradorServico.exe"
  Delete "$DataDir\.agent-control.json"
  Delete "$INSTDIR\Desinstalar.exe"
  MessageBox MB_YESNO|MB_DEFBUTTON2 "Apagar também a configuração privada e os logs? Escolha Não para preservar os dados para uma reinstalação." /SD IDNO IDNO preserve
    Delete "$DataDir\config.json"
    Delete "$DataDir\config.backup.json"
    Delete "$DataDir\config.new.json"
    RMDir /r "$DataDir\logs"
  preserve:
  RMDir "$INSTDIR"
  RMDir "$DataDir"
SectionEnd
