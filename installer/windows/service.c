#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <winsvc.h>
#include <shlobj.h>
#include <stdio.h>
#include <wchar.h>

static const wchar_t SERVICE_NAME[] = L"BuscaPrecoIntegradorVR";
static SERVICE_STATUS_HANDLE status_handle;
static SERVICE_STATUS status;
static HANDLE stop_event;

static DWORD report(DWORD state, DWORD error, DWORD wait) {
    status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    status.dwCurrentState = state;
    status.dwControlsAccepted = state == SERVICE_RUNNING ? SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN : 0;
    status.dwWin32ExitCode = error ? ERROR_SERVICE_SPECIFIC_ERROR : NO_ERROR;
    status.dwServiceSpecificExitCode = error;
    status.dwWaitHint = wait;
    status.dwCheckPoint = state == SERVICE_START_PENDING || state == SERVICE_STOP_PENDING ? status.dwCheckPoint + 1 : 0;
    return SetServiceStatus(status_handle, &status) ? 0 : GetLastError();
}

static void WINAPI control(DWORD code) {
    if ((code == SERVICE_CONTROL_STOP || code == SERVICE_CONTROL_SHUTDOWN) && stop_event) SetEvent(stop_event);
}

static DWORD locations(wchar_t *program, wchar_t *data) {
    DWORD length = GetModuleFileNameW(NULL, program, MAX_PATH);
    if (!length || length >= MAX_PATH) return ERROR_INSUFFICIENT_BUFFER;
    wchar_t *separator = wcsrchr(program, L'\\');
    if (!separator) return ERROR_BAD_PATHNAME;
    *separator = 0;
    if (FAILED(SHGetFolderPathW(NULL, CSIDL_COMMON_APPDATA, NULL, SHGFP_TYPE_CURRENT, data))) return ERROR_BAD_PATHNAME;
    if (wcslen(data) + wcslen(L"\\BuscaPrecoIntegrador") >= MAX_PATH) return ERROR_INSUFFICIENT_BUFFER;
    wcscat(data, L"\\BuscaPrecoIntegrador");
    return 0;
}

static DWORD launch(const wchar_t *mode, PROCESS_INFORMATION *process) {
    wchar_t program[MAX_PATH], data[MAX_PATH], executable[MAX_PATH + 32], command[2048];
    DWORD error = locations(program, data);
    if (error) return error;
    if (swprintf(executable, MAX_PATH + 32, L"%ls\\runtime\\node.exe", program) < 0 ||
        swprintf(command, 2048, L"\"%ls\" \"%ls\\integrador.mjs\" %ls --data-dir \"%ls\"", executable, program, mode, data) < 0) return ERROR_INSUFFICIENT_BUFFER;
    STARTUPINFOW startup = {0};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE;
    if (!CreateProcessW(executable, command, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, program, &startup, process)) return GetLastError();
    CloseHandle(process->hThread);
    return 0;
}

static void WINAPI service_main(DWORD argc, LPWSTR *argv) {
    (void)argc; (void)argv;
    status_handle = RegisterServiceCtrlHandlerW(SERVICE_NAME, control);
    if (!status_handle) return;
    report(SERVICE_START_PENDING, 0, 10000);
    stop_event = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (!stop_event) { report(SERVICE_STOPPED, GetLastError(), 0); return; }
    PROCESS_INFORMATION child = {0};
    DWORD error = launch(L"--background", &child);
    if (error) { CloseHandle(stop_event); report(SERVICE_STOPPED, error, 0); return; }
    report(SERVICE_RUNNING, 0, 0);
    HANDLE events[] = {stop_event, child.hProcess};
    DWORD result = WaitForMultipleObjects(2, events, FALSE, INFINITE);
    if (result == WAIT_OBJECT_0) {
        report(SERVICE_STOP_PENDING, 0, 15000);
        PROCESS_INFORMATION stopper = {0};
        if (!launch(L"--stop", &stopper)) {
            if (WaitForSingleObject(stopper.hProcess, 5000) == WAIT_TIMEOUT) TerminateProcess(stopper.hProcess, 1);
            CloseHandle(stopper.hProcess);
        }
        // This handle belongs to the precise child we created, never an arbitrary PID.
        if (WaitForSingleObject(child.hProcess, 5000) == WAIT_TIMEOUT) {
            TerminateProcess(child.hProcess, 1);
            WaitForSingleObject(child.hProcess, 1000);
        }
        error = 0;
    } else {
        GetExitCodeProcess(child.hProcess, &error);
        if (!error) error = ERROR_PROCESS_ABORTED;
    }
    CloseHandle(child.hProcess);
    CloseHandle(stop_event);
    stop_event = NULL;
    report(SERVICE_STOPPED, error, 0);
}

static DWORD wait_stopped(SC_HANDLE service) {
    SERVICE_STATUS_PROCESS current;
    DWORD bytes, start = GetTickCount();
    for (;;) {
        if (!QueryServiceStatusEx(service, SC_STATUS_PROCESS_INFO, (BYTE *)&current, sizeof(current), &bytes)) return GetLastError();
        if (current.dwCurrentState == SERVICE_STOPPED) return 0;
        if (GetTickCount() - start > 30000) return ERROR_TIMEOUT;
        Sleep(200);
    }
}

static DWORD stop_service(SC_HANDLE manager, BOOL remove) {
    SC_HANDLE service = OpenServiceW(manager, SERVICE_NAME, SERVICE_STOP | SERVICE_QUERY_STATUS | (remove ? DELETE : 0));
    if (!service) { DWORD error = GetLastError(); return error == ERROR_SERVICE_DOES_NOT_EXIST ? 0 : error; }
    SERVICE_STATUS current;
    DWORD error = 0;
    if (!ControlService(service, SERVICE_CONTROL_STOP, &current) && GetLastError() != ERROR_SERVICE_NOT_ACTIVE) error = GetLastError();
    if (!error) error = wait_stopped(service);
    if (!error && remove && !DeleteService(service)) error = GetLastError();
    CloseServiceHandle(service);
    return error;
}

static DWORD install_service(SC_HANDLE manager, BOOL automatic) {
    wchar_t executable[MAX_PATH], quoted[MAX_PATH + 4];
    DWORD length = GetModuleFileNameW(NULL, executable, MAX_PATH);
    if (!length || length >= MAX_PATH || swprintf(quoted, MAX_PATH + 4, L"\"%ls\"", executable) < 0) return ERROR_INSUFFICIENT_BUFFER;
    DWORD start = automatic ? SERVICE_AUTO_START : SERVICE_DEMAND_START;
    SC_HANDLE service = CreateServiceW(manager, SERVICE_NAME, L"Busca Preço - Integrador VR", SERVICE_CHANGE_CONFIG | SERVICE_START,
        SERVICE_WIN32_OWN_PROCESS, start, SERVICE_ERROR_NORMAL, quoted, NULL, NULL, NULL, L"NT AUTHORITY\\LocalService", NULL);
    if (!service && GetLastError() == ERROR_SERVICE_EXISTS) {
        service = OpenServiceW(manager, SERVICE_NAME, SERVICE_CHANGE_CONFIG | SERVICE_START);
        if (service && !ChangeServiceConfigW(service, SERVICE_WIN32_OWN_PROCESS, start, SERVICE_ERROR_NORMAL,
                quoted, NULL, NULL, NULL, L"NT AUTHORITY\\LocalService", NULL, L"Busca Preço - Integrador VR")) {
            DWORD error = GetLastError(); CloseServiceHandle(service); return error;
        }
    }
    if (!service) return GetLastError();
    SERVICE_DESCRIPTIONW description = {L"Sincroniza produtos e preços do VR/PostgreSQL por HTTPS, sem login no Windows."};
    SC_ACTION actions[] = {{SC_ACTION_RESTART, 60000}, {SC_ACTION_RESTART, 60000}, {SC_ACTION_RESTART, 60000}};
    SERVICE_FAILURE_ACTIONSW failure = {86400, NULL, NULL, 3, actions};
    SERVICE_FAILURE_ACTIONS_FLAG flag = {TRUE};
    DWORD error = 0;
    if (!ChangeServiceConfig2W(service, SERVICE_CONFIG_DESCRIPTION, &description) ||
        !ChangeServiceConfig2W(service, SERVICE_CONFIG_FAILURE_ACTIONS, &failure)) error = GetLastError();
    if (!error && !ChangeServiceConfig2W(service, SERVICE_CONFIG_FAILURE_ACTIONS_FLAG, &flag)) {
        error = GetLastError();
        // Optional non-crash recovery is absent in some compatibility layers.
        // Boot startup, the service account and normal stop remain mandatory.
        if (error == ERROR_INVALID_LEVEL || error == ERROR_CALL_NOT_IMPLEMENTED) {
            fwprintf(stderr, L"Reinício após falhas não-críticas indisponível; serviço automático configurado.\n");
            error = 0;
        }
    }
    CloseServiceHandle(service);
    return error;
}

int wmain(int argc, wchar_t **argv) {
    if (argc == 1) {
        SERVICE_TABLE_ENTRYW table[] = {{(LPWSTR)SERVICE_NAME, service_main}, {NULL, NULL}};
        return StartServiceCtrlDispatcherW(table) ? 0 : (int)GetLastError();
    }
    SC_HANDLE manager = OpenSCManagerW(NULL, NULL, SC_MANAGER_CONNECT | SC_MANAGER_CREATE_SERVICE);
    if (!manager) return (int)GetLastError();
    DWORD error;
    if (!wcscmp(argv[1], L"--install-service") && argc == 3 && (!wcscmp(argv[2], L"auto") || !wcscmp(argv[2], L"demand"))) {
        error = install_service(manager, !wcscmp(argv[2], L"auto"));
    } else if (!wcscmp(argv[1], L"--stop-service")) error = stop_service(manager, FALSE);
    else if (!wcscmp(argv[1], L"--remove-service")) error = stop_service(manager, TRUE);
    else error = ERROR_INVALID_PARAMETER;
    CloseServiceHandle(manager);
    if (error) fwprintf(stderr, L"Operação do serviço não concluída (Windows %lu).\n", error);
    return (int)error;
}
