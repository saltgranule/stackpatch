import koffi from "koffi";

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x0000_2000;
const PROCESS_TERMINATE = 0x0001;
const PROCESS_SET_QUOTA = 0x0100;

const JOBOBJECT_BASIC_LIMIT_INFORMATION = koffi.struct("JOBOBJECT_BASIC_LIMIT_INFORMATION", {
  PerProcessUserTimeLimit: "int64",
  PerJobUserTimeLimit: "int64",
  LimitFlags: "uint32",
  MinimumWorkingSetSize: "uint64",
  MaximumWorkingSetSize: "uint64",
  ActiveProcessLimit: "uint32",
  Affinity: "uint64",
  PriorityClass: "uint32",
  SchedulingClass: "uint32",
});

const IO_COUNTERS = koffi.struct("IO_COUNTERS", {
  ReadOperationCount: "uint64",
  WriteOperationCount: "uint64",
  OtherOperationCount: "uint64",
  ReadTransferCount: "uint64",
  WriteTransferCount: "uint64",
  OtherTransferCount: "uint64",
});

const JOBOBJECT_EXTENDED_LIMIT_INFORMATION_STRUCT = koffi.struct("JOBOBJECT_EXTENDED_LIMIT_INFORMATION", {
  BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION,
  IoInfo: IO_COUNTERS,
  ProcessMemoryLimit: "uint64",
  JobMemoryLimit: "uint64",
  PeakProcessMemoryUsed: "uint64",
  PeakJobMemoryUsed: "uint64",
});

const emptyLimitInfo = {
  PerProcessUserTimeLimit: 0,
  PerJobUserTimeLimit: 0,
  LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
  MinimumWorkingSetSize: 0,
  MaximumWorkingSetSize: 0,
  ActiveProcessLimit: 0,
  Affinity: 0,
  PriorityClass: 0,
  SchedulingClass: 0,
};

const emptyIoCounters = {
  ReadOperationCount: 0,
  WriteOperationCount: 0,
  OtherOperationCount: 0,
  ReadTransferCount: 0,
  WriteTransferCount: 0,
  OtherTransferCount: 0,
};

/**
 * Windows job object with KILL_ON_JOB_CLOSE so managed instance processes
 * terminate when the daemon exits (including abrupt console closure).
 */
export class WindowsKillJob {
  private readonly jobHandle: unknown;
  private readonly openProcess: (access: number, inherit: number, pid: number) => unknown;
  private readonly assignProcessToJobObject: (job: unknown, process: unknown) => number;
  private readonly closeHandle: (handle: unknown) => number;

  constructor() {
    const kernel32 = koffi.load("kernel32.dll");
    const createJobObjectW = kernel32.func("void* __stdcall CreateJobObjectW(void* lpJobAttributes, void* lpName)");
    const setInformationJobObject = kernel32.func(
      "int __stdcall SetInformationJobObject(void* hJob, int JobObjectInfoClass, JOBOBJECT_EXTENDED_LIMIT_INFORMATION* lpJobObjectInfo, uint32 cbJobObjectInfoLength)",
    );

    this.openProcess = kernel32.func(
      "void* __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)",
    );
    this.assignProcessToJobObject = kernel32.func(
      "int __stdcall AssignProcessToJobObject(void* hJob, void* hProcess)",
    );
    this.closeHandle = kernel32.func("int __stdcall CloseHandle(void* hObject)");

    const jobHandle = createJobObjectW(null, null);
    if (!jobHandle) {
      throw new Error("CreateJobObjectW failed");
    }

    const info = {
      BasicLimitInformation: emptyLimitInfo,
      IoInfo: emptyIoCounters,
      ProcessMemoryLimit: 0,
      JobMemoryLimit: 0,
      PeakProcessMemoryUsed: 0,
      PeakJobMemoryUsed: 0,
    };

    const infoSize = koffi.sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION_STRUCT);
    if (setInformationJobObject(jobHandle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, info, infoSize) === 0) {
      this.closeHandle(jobHandle);
      throw new Error("SetInformationJobObject failed");
    }

    this.jobHandle = jobHandle;
  }

  assignPid(pid: number): boolean {
    if (!pid || pid <= 0) {
      return false;
    }

    const processHandle = this.openProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, 0, pid);
    if (!processHandle) {
      return false;
    }

    try {
      return this.assignProcessToJobObject(this.jobHandle, processHandle) !== 0;
    } finally {
      this.closeHandle(processHandle);
    }
  }
}

export function createWindowsKillJob(): WindowsKillJob | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    return new WindowsKillJob();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[stackpatch] Windows kill job unavailable (${message}); relying on explicit process cleanup`);
    return null;
  }
}
