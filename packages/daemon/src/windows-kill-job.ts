import koffi from "koffi";

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
const JOB_OBJECT_CPU_RATE_CONTROL_INFORMATION = 15;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x0000_2000;
const JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x0000_0100;
const JOB_OBJECT_LIMIT_CPU_RATE_CONTROL = 0x0004_0000;
const JOB_OBJECT_CPU_RATE_CONTROL_ENABLE = 0x1;
const JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP = 0x4;
const PROCESS_TERMINATE = 0x0001;
const PROCESS_SET_QUOTA = 0x0100;

/** NTSTATUS STATUS_JOB_MEMORY_LIMIT — exit code when a job process exceeds its memory cap. */
export const STATUS_JOB_MEMORY_LIMIT = 0xc000_01a7;

export function isMemoryLimitExitCode(code: number | null): boolean {
  if (code === null) {
    return false;
  }
  return (code >>> 0) === STATUS_JOB_MEMORY_LIMIT;
}

export interface WindowsInstanceJobOptions {
  memoryLimitMb?: number | null;
  cpuLimitPercent?: number | null;
}

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

const JOBOBJECT_CPU_RATE_CONTROL_INFORMATION_STRUCT = koffi.struct(
  "JOBOBJECT_CPU_RATE_CONTROL_INFORMATION",
  {
    ControlFlags: "uint32",
    CpuRate: "uint32",
  },
);

const emptyIoCounters = {
  ReadOperationCount: 0,
  WriteOperationCount: 0,
  OtherOperationCount: 0,
  ReadTransferCount: 0,
  WriteTransferCount: 0,
  OtherTransferCount: 0,
};

function buildBasicLimitInfo(limitFlags: number) {
  return {
    PerProcessUserTimeLimit: 0,
    PerJobUserTimeLimit: 0,
    LimitFlags: limitFlags,
    MinimumWorkingSetSize: 0,
    MaximumWorkingSetSize: 0,
    ActiveProcessLimit: 0,
    Affinity: 0,
    PriorityClass: 0,
    SchedulingClass: 0,
  };
}

/**
 * Windows job object with KILL_ON_JOB_CLOSE so managed instance processes
 * terminate when the daemon exits (including abrupt console closure).
 * Optional per-instance memory and CPU limits are applied at creation time.
 */
export class WindowsKillJob {
  private readonly jobHandle: unknown;
  private readonly openProcess: (access: number, inherit: number, pid: number) => unknown;
  private readonly assignProcessToJobObject: (job: unknown, process: unknown) => number;
  private readonly closeHandle: (handle: unknown) => number;
  private closed = false;

  constructor(options: WindowsInstanceJobOptions = {}) {
    const kernel32 = koffi.load("kernel32.dll");
    const createJobObjectW = kernel32.func("void* __stdcall CreateJobObjectW(void* lpJobAttributes, void* lpName)");
    const setExtendedLimitInformation = kernel32.func(
      "int __stdcall SetInformationJobObject(void* hJob, int JobObjectInfoClass, JOBOBJECT_EXTENDED_LIMIT_INFORMATION* lpJobObjectInfo, uint32 cbJobObjectInfoLength)",
    );
    const setCpuRateInformation = kernel32.func(
      "int __stdcall SetInformationJobObject(void* hJob, int JobObjectInfoClass, JOBOBJECT_CPU_RATE_CONTROL_INFORMATION* lpJobObjectInfo, uint32 cbJobObjectInfoLength)",
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

    let limitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let processMemoryLimit = 0;

    const memoryLimitMb = options.memoryLimitMb;
    if (memoryLimitMb !== null && memoryLimitMb !== undefined && memoryLimitMb > 0) {
      limitFlags |= JOB_OBJECT_LIMIT_PROCESS_MEMORY;
      processMemoryLimit = memoryLimitMb * 1024 * 1024;
    }

    const cpuLimitPercent = options.cpuLimitPercent;
    if (cpuLimitPercent !== null && cpuLimitPercent !== undefined && cpuLimitPercent > 0) {
      limitFlags |= JOB_OBJECT_LIMIT_CPU_RATE_CONTROL;
    }

    const info = {
      BasicLimitInformation: buildBasicLimitInfo(limitFlags),
      IoInfo: emptyIoCounters,
      ProcessMemoryLimit: processMemoryLimit,
      JobMemoryLimit: 0,
      PeakProcessMemoryUsed: 0,
      PeakJobMemoryUsed: 0,
    };

    const infoSize = koffi.sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION_STRUCT);
    if (setExtendedLimitInformation(jobHandle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, info, infoSize) === 0) {
      this.closeHandle(jobHandle);
      throw new Error("SetInformationJobObject failed for extended limits");
    }

    if (cpuLimitPercent !== null && cpuLimitPercent !== undefined && cpuLimitPercent > 0) {
      const cpuInfo = {
        ControlFlags: JOB_OBJECT_CPU_RATE_CONTROL_ENABLE | JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP,
        CpuRate: Math.min(100, cpuLimitPercent) * 100,
      };
      const cpuInfoSize = koffi.sizeof(JOBOBJECT_CPU_RATE_CONTROL_INFORMATION_STRUCT);
      if (
        setCpuRateInformation(jobHandle, JOB_OBJECT_CPU_RATE_CONTROL_INFORMATION, cpuInfo, cpuInfoSize) === 0
      ) {
        this.closeHandle(jobHandle);
        throw new Error("SetInformationJobObject failed for CPU rate control");
      }
    }

    this.jobHandle = jobHandle;
  }

  assignPid(pid: number): boolean {
    if (!pid || pid <= 0 || this.closed) {
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

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeHandle(this.jobHandle);
  }
}

export function createWindowsInstanceJob(options: WindowsInstanceJobOptions = {}): WindowsKillJob | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    return new WindowsKillJob(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[stackpatch] Windows instance job unavailable (${message}); relying on explicit process cleanup`);
    return null;
  }
}
