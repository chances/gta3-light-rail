# D Language ASI Plugin for GTA III — Research Report

> **Target:** Win32 (x86, 32-bit) ASI plugin (renamed `.dll`) loaded by Ultimate ASI Loader via `LoadLibrary`. No
> exports required — only a functioning `DllMain` on `DLL_PROCESS_ATTACH`.

---

## 1. Compiler Options for a 32-bit Windows DLL in D

### The Three Compilers

| Compiler | Win32 Status                                     | Recommended?                       |
| -------- | ------------------------------------------------ | ---------------------------------- |
| **DMD**  | Native Win32 support, ships OPTLINK              | Usable; OPTLINK is archaic         |
| **LDC**  | First-class Win32/MSVC since 2016                | **Yes — strongly preferred**       |
| **GDC**  | Linux-only official; unofficial Win builds exist | **No** — avoid for Windows targets |

---

### DMD (Digital Mars D — reference compiler)

DMD on Windows ships two distinct x86 modes:

```/dev/null/build.cmd#L1-6
rem OMF mode — uses OPTLINK linker, produces .omf object files
dmd -m32 -shared -ofmyplugin.dll myplugin.d

rem COFF mode — uses MSVC link.exe or lld-link, produces COFF objects
dmd -m32mscoff -shared -ofmyplugin.dll myplugin.d
```

**`-m32` (default 32-bit)** uses the old **OPTLINK** linker with **OMF** (Intel Object Module Format) object files. This
is a legacy format dating to the DOS era. OPTLINK is bundled inside the DMD installer as `optlink.exe` (historically
named `link.exe` — renamed in DMD 2.088 to avoid confusion with MSVC). Key characteristics of OPTLINK:

- Cannot link `.lib` files in COFF format (e.g., anything compiled by MSVC, MinGW, or clang). You must convert with
  `coff2omf` or `coffimplib`.
- Does not produce PDB debug info — only CodeView `.cv` in the `.dll` itself.
- Buggy with some edge cases (large `.bss` segments, certain `__declspec` equivalents).

**`-m32mscoff`** drops OPTLINK entirely, emits COFF objects, and delegates to MSVC `link.exe` or LLD. This is strictly
better for interoperating with external C libraries. However it requires a Visual Studio or Build Tools installation, or
at least the Windows SDK.

**Conclusion:** DMD `-m32mscoff` is workable. Plain DMD `-m32` / OPTLINK is a landmine for anything that links a
third-party C library (such as MinHook).

---

### LDC (LLVM-based D compiler)

LDC is the right tool for a game plugin. It has been the primary recommendation from D core devs for
performance-sensitive or Windows-native work since ~2016.

```/dev/null/build.cmd#L1-8
rem 32-bit Windows DLL — preferred invocation
ldc2 -m32 -shared -betterC -ofmyplugin.dll myplugin.d

rem With MSVC toolchain explicitly selected
ldc2 -m32 -shared -mtriple=i686-pc-windows-msvc -betterC -ofmyplugin.dll myplugin.d

rem With optimisations (important for performance in a game loop)
ldc2 -m32 -shared -betterC -O2 -release -ofmyplugin.dll myplugin.d
```

When LDC finds a Visual C++ toolchain (VS 2015+ or Build Tools), it automatically uses **MSVC `link.exe`** or its
bundled **LLD** as the linker, producing proper COFF/PE output. If no VS install is found, it falls back to its bundled
**LLD-link** with MinGW-w64 import libraries (requires `vcruntime140.dll` at runtime).

For `-m32`, LDC targets `i686-pc-windows-msvc` or `i686-w64-windows-gnu` depending on configuration. The MSVC triple is
strongly preferred for a game plugin because it matches the GTA III process's C runtime.

**Linker summary for LDC on Win32:**

| Scenario                            | Linker             |
| ----------------------------------- | ------------------ |
| VS/Build Tools installed            | `link.exe` (MSVC)  |
| No VS, LDC standalone               | Bundled `lld-link` |
| Explicitly set via env var `LINKER` | Whatever you set   |

---

### GDC (GCC-based D compiler)

GDC is part of GCC and is excellent on Linux, but:

- The official `dlang.org/install.sh` notes it is **Linux-only**.
- The GDC project page advertises "work-in-progress unofficial Windows release".
- There is **no stable, tested Win32 GDC binary** suitable for production use.

**Do not use GDC for this project.** Stick to LDC.

---

## 2. D BetterC Mode (`-betterC`)

BetterC removes the dependency on **druntime** (the D runtime library), keeping only the C runtime (`msvcrt.dll` /
`ucrtbase.dll`). It is the correct choice for a game plugin DLL.

### What `-betterC` Eliminates

| Feature                             | Removed?      | Notes                              |
| ----------------------------------- | ------------- | ---------------------------------- |
| Garbage Collector                   | ✅ Yes        | No `new` on classes, no GC heap    |
| `TypeInfo` / `ModuleInfo`           | ✅ Yes        | No runtime reflection              |
| D `class` (reference types)         | ✅ Yes        | `struct` still works fully         |
| Built-in `core.thread`              | ✅ Yes        | OS threads still usable via WinAPI |
| `Throwable` / exception runtime     | ✅ Yes        | C SEH still exists in the process  |
| `unittest` blocks                   | ✅ Disabled   | (Can re-enable with `-unittest`)   |
| `assert` → druntime handler         | ✅ Yes        | Redirected to C `assert()` / abort |
| Module constructors (`static this`) | ✅ Yes        | Runs only with druntime init       |
| `std.*` (Phobos)                    | ✅ Most of it | `core.stdc.*` is still usable      |

### What Remains Available

| Feature                                       | Available in BetterC  |
| --------------------------------------------- | --------------------- |
| Structs with constructors/destructors         | ✅                    |
| Templates, mixins, `static if`                | ✅ (all compile-time) |
| `scope(exit)` / RAII                          | ✅                    |
| Inline assembler (`asm { }`)                  | ✅                    |
| `extern(C)`, `extern(Windows)`, `extern(C++)` | ✅                    |
| Function pointers, delegates (limited)        | ✅                    |
| `@nogc`, `nothrow`, `@safe` / `@trusted`      | ✅                    |
| `core.stdc.*` (printf, malloc, memcpy, …)     | ✅                    |
| `core.sys.windows.*` (WINAPI types/functions) | ✅                    |
| Static arrays and slices of static arrays     | ✅                    |
| String literals (as `const char*` / slices)   | ✅                    |
| Enum, union, bit fields                       | ✅                    |
| `pragma(mangle, "…")`                         | ✅                    |

### `DllMain` in BetterC

The critical question: **Yes, `DllMain` works in BetterC**, but you must write it yourself rather than using the
`SimpleDllMain` mixin. That mixin calls `dll_process_attach` / `dll_thread_attach` from druntime, which is unavailable.
In BetterC you bypass all of that and handle the entry point manually — which is exactly what you want for a game plugin
anyway:

```/dev/null/dllmain_betterC.d#L1-22
module dllmain;

import core.sys.windows.windef : HINSTANCE, BOOL, DWORD, LPVOID, TRUE, FALSE;
import core.sys.windows.winnt  : DLL_PROCESS_ATTACH, DLL_PROCESS_DETACH,
                                  DLL_THREAD_ATTACH, DLL_THREAD_DETACH;

// __gshared: thread-local storage is stripped in betterC, use __gshared
__gshared HINSTANCE g_hInst;

extern (Windows)
BOOL DllMain(HINSTANCE hInstance, DWORD reason, LPVOID reserved) nothrow @nogc
{
    switch (reason)
    {
        case DLL_PROCESS_ATTACH:
            g_hInst = hInstance;
            onAttach();   // your init code
            break;
        case DLL_PROCESS_DETACH:
            onDetach();
            break;
        default: break;
    }
    return TRUE;
}
```

**Caveats for BetterC DLLs:**

1. **No `static this()` module constructors.** Any init code must be called explicitly from `DllMain`. This is actually
   safer in a DLL anyway (avoids DllMain lock issues).
2. **No D `class`.** Use `struct` everywhere. COM-style vtable classes via `interface` + `extern(C++)` still work.
3. **No exceptions.** Use `nothrow` everywhere. Any Phobos function that throws is off-limits.
4. **`__gshared` is your friend.** Without druntime, TLS (thread-local storage via `__thread` / `static`) still
   technically compiles but the initialization may be unreliable. Use `__gshared` for plugin globals and manage thread
   safety manually.
5. **D's associative arrays (`int[string]`) require the GC.** Use a C hash map or just arrays.

---

## 3. Calling Conventions for Hooking x86 GTA III Functions

GTA III (Win32, original exe) uses a mix of:

- **`__cdecl`** — all standalone C-style functions, the default for MSVC without `/Gz`.
- **`__thiscall`** — all non-`static` C++ member functions. `this` is passed in `ECX`; callee cleans the stack.
- **`__stdcall`** — Windows API callbacks, some game callbacks.
- **`__fastcall`** — rare in GTA III (primarily MSVC-internal helpers).

### `extern(C)` — cdecl

The simplest and most common case. D's `extern(C)` maps directly to `__cdecl`:

```/dev/null/calling_conventions.d#L1-12
// Declare a cdecl function pointer to a game function at a known address
extern (C) alias CWorldAdd_t = void function(void* entity) nothrow @nogc;

// Cast the absolute address to a function pointer
auto CWorld_Add = cast(CWorldAdd_t) 0x00563410;

// Call it
CWorld_Add(someEntity);
```

### `extern(Windows)` — stdcall

`extern(Windows)` is D's name for `__stdcall`. Callee cleans the stack; name-mangled with leading `_` and trailing `@N`
(byte count). Use this for WinAPI callbacks:

```/dev/null/calling_conventions.d#L15-20
// stdcall example
extern (Windows) alias WndProc_t =
    int function(void* hWnd, uint msg, size_t wParam, ptrdiff_t lParam) nothrow @nogc;
```

### `extern(C++)` — thiscall (the tricky one)

D has **no native `__thiscall` calling convention keyword**. This is a well-known limitation discussed extensively in
the D forums (2006, 2011, 2016 threads). The conventional workarounds:

#### Option A — `extern(C++)` struct method (works on MSVC targets, LDC recommended)

When targeting MSVC ABI (`i686-pc-windows-msvc`), D's `extern(C++)` for a `struct` method generates `__thiscall` code on
x86 — because that is the MSVC C++ ABI for member functions:

```/dev/null/thiscall.d#L1-38
// Define a D struct that mirrors the C++ object layout
// The vtable pointer and fields must match the game's class layout exactly.
extern (C++) struct CPed
{
    // vtable pointer is implicit in extern(C++) structs
    // Layout your known fields here:
    ubyte[0x7C] _pad0;   // offset 0x00..0x7B (adjust per reversing)
    int          m_nPedType;  // offset 0x7C

    // Member function declarations — D will call these with __thiscall ABI
    // (only on MSVC ABI target with LDC/DMD -m32mscoff)
    void Give_Weapon(int weaponType, int ammo) nothrow @nogc;
}

// Rebase at runtime if needed:
CPed* GetPlayerPed()
{
    // GTA III stores the player ped pointer at a known address
    return *cast(CPed**) 0x0057F538;
}
```

> **⚠ Warning:** This approach only reliably generates `__thiscall` with LDC targeting `i686-pc-windows-msvc`. With DMD
> `-m32` (OMF/OPTLINK), `extern(C++)` methods are still pushed on the stack with `this` first — the ABI may differ from
> MSVC. Always verify with a disassembler (x64dbg) on first use.

#### Option B — Inline Assembly Thiscall Shim (portable, guaranteed correct)

The safest approach for arbitrary thiscall targets is a hand-written asm shim. This works identically regardless of
which D compiler you use:

```/dev/null/thiscall_asm.d#L1-50
module thiscall_asm;

import core.stdc.stdint : uintptr_t;

// Generic thiscall invoker — calls address `fn` with `self` in ECX,
// and up to 3 additional arguments on the stack (cdecl-style from D).
//
// For functions with different signatures, write a typed wrapper.

// Example: void CPed::SetCurrentWeapon(int weaponType)
//   Address: 0x004F1550 (fictional — look up in your IDA/Ghidra database)
void Ped_SetCurrentWeapon(void* self, int weaponType) nothrow @nogc @trusted
{
    // Save ECX, load self, call via absolute address
    asm nothrow @nogc
    {
        mov  ECX, self;
        push weaponType;
        mov  EAX, 0x004F1550;
        call EAX;
        // Callee (__thiscall) cleans its own stack args, so no `add ESP` needed
    }
}

// Example: float CEntity::GetDistanceTo(float x, float y, float z)
//   Returns float in ST(0) on x86
float Entity_GetDistanceTo(void* self, float x, float y, float z) nothrow @nogc @trusted
{
    float result;
    asm nothrow @nogc
    {
        // Push args right-to-left
        push  z;
        push  y;
        push  x;
        mov   ECX, self;
        mov   EAX, 0x00541A20;   // fictional address
        call  EAX;
        // x87 result is in ST(0) — store to result
        fstp  result;
    }
    return result;
}
```

> **LDC note:** LDC's inline assembler uses DMD-compatible AT&T-ish syntax inside `asm { }` blocks (Intel syntax with
> DMD register names). LDC also supports **GCC extended inline asm** via `__asm` for more power, but the standard
> `asm { }` block works fine here.

---

## 4. Linking Against MinHook from D

MinHook is a BSD-licensed C library (`MinHook.h` + a static `.lib` / `.a`). Binding to it from D is straightforward:
declare each C function with `extern(C)`.

### Step 1 — Build MinHook for COFF/MSVC x86

Clone and build with CMake targeting `Win32`:

```/dev/null/build_minhook.cmd#L1-6
cmake -G "Visual Studio 17 2022" -A Win32 -S . -B build32
cmake --build build32 --config Release
rem Result: build32\Release\MinHook.lib  (COFF format, usable by LDC + MSVC link.exe)
```

If using LDC with MinGW libs, build with MinGW-w64 instead to get a `.a` in COFF/GNU format.

### Step 2 — D Binding (`minhook.d`)

```/dev/null/minhook.d#L1-68
/**
 * Minimal D binding for MinHook 1.3.3
 * https://github.com/TsudaKageyu/minhook
 *
 * Compile with:  ldc2 -m32 -shared -betterC plugin.d minhook.d MinHook.lib
 */
module minhook;

extern (C) @nogc nothrow:

// -------------------------------------------------------------------------
// Status codes
// -------------------------------------------------------------------------
enum MH_STATUS : int
{
    MH_UNKNOWN          = -1,
    MH_OK               =  0,
    MH_ERROR_ALREADY_INITIALIZED,
    MH_ERROR_NOT_INITIALIZED,
    MH_ERROR_ALREADY_CREATED,
    MH_ERROR_NOT_CREATED,
    MH_ERROR_ENABLED,
    MH_ERROR_DISABLED,
    MH_ERROR_NOT_EXECUTABLE,
    MH_ERROR_UNSUPPORTED_FUNCTION,
    MH_ERROR_MEMORY_ALLOC,
    MH_ERROR_MEMORY_PROTECT,
    MH_ERROR_MODULE_NOT_FOUND,
    MH_ERROR_FUNCTION_NOT_FOUND,
}

// Sentinel value for MH_EnableHook / MH_DisableHook — hook all
enum void* MH_ALL_HOOKS = null;

// -------------------------------------------------------------------------
// Core API
// -------------------------------------------------------------------------

// Initialize the MinHook library. Call once at DLL_PROCESS_ATTACH.
MH_STATUS MH_Initialize();

// Uninitialize and remove all hooks.
MH_STATUS MH_Uninitialize();

// Create a hook at `pTarget`, redirecting to `pDetour`.
// `ppOriginal` receives the trampoline pointer (to call the original).
MH_STATUS MH_CreateHook(void* pTarget, void* pDetour, void** ppOriginal);

// Create a hook by module name + exported function name.
MH_STATUS MH_CreateHookApi(
    const(wchar)* pszModule,
    const(char)*  pszProcName,
    void*         pDetour,
    void**        ppOriginal
);

// Enable / disable a single hook (or MH_ALL_HOOKS).
MH_STATUS MH_EnableHook(void* pTarget);
MH_STATUS MH_DisableHook(void* pTarget);

// Queue enable/disable without applying yet.
MH_STATUS MH_QueueEnableHook(void* pTarget);
MH_STATUS MH_QueueDisableHook(void* pTarget);

// Apply all queued hooks atomically.
MH_STATUS MH_ApplyQueued();

// Human-readable status string (useful for debug logging).
const(char)* MH_StatusToString(MH_STATUS status);
```

### Step 3 — Using MinHook in the Plugin

```/dev/null/plugin_minhook_example.d#L1-72
module plugin;

import minhook;
import core.sys.windows.windef;
import core.sys.windows.winnt;
import core.stdc.stdio : printf;

// ---- Type alias for the hooked function ----
// GTA III: CStreaming::RequestModel(int modelId, int flags)  [cdecl, address 0x004087E0]
extern (C) alias RequestModel_t = void function(int modelId, int flags) nothrow @nogc;

__gshared RequestModel_t original_RequestModel;

// ---- Our detour ----
extern (C) void detour_RequestModel(int modelId, int flags) nothrow @nogc
{
    // Intercept model load requests
    if (modelId == 0x129)   // tram carriage model ID (fictional)
    {
        // Do something extra...
    }
    // Call the original via trampoline
    original_RequestModel(modelId, flags);
}

// ---- Init ----
void pluginInit() nothrow @nogc
{
    if (MH_Initialize() != MH_STATUS.MH_OK)
        return;

    void* target = cast(void*) 0x004087E0;   // absolute VA of CStreaming::RequestModel
    MH_CreateHook(target,
                  &detour_RequestModel,
                  cast(void**) &original_RequestModel);
    MH_EnableHook(target);
}

void pluginShutdown() nothrow @nogc
{
    MH_Uninitialize();
}

// ---- DllMain ----
extern (Windows)
BOOL DllMain(HINSTANCE hInst, DWORD reason, LPVOID reserved) nothrow @nogc
{
    switch (reason)
    {
        case DLL_PROCESS_ATTACH: pluginInit();    break;
        case DLL_PROCESS_DETACH: pluginShutdown(); break;
        default: break;
    }
    return TRUE;
}
```

**Link command:**

```/dev/null/build.cmd#L1-4
ldc2 -m32 -shared -betterC ^
     -ofmyplugin.dll ^
     plugin.d minhook.d ^
     MinHook.lib kernel32.lib
```

---

## 5. Alternatives to MinHook — D-Native Hooking

### D-Native Libraries

There is **no widely-used, maintained D-native hooking library** equivalent to MinHook or safetyhook that targets Win32
x86. The Nim language has a MinHook wrapper (`khchen/minhook`), but nothing equivalent exists for D as a packaged
library on `code.dlang.org` as of 2024.

Your best options are:

1. **MinHook via C binding** (recommended — as above).
2. **safetyhook** — a modern C++ hooking library. Bindable from D via `extern(C++)`, but requires MSVC ABI compatibility
   and is more complex to bind.
3. **Manual inline-assembly trampoline** (see below) — zero dependencies.

### Manual Trampoline Hook in D Inline Assembly

For a lightweight, dependency-free hook, you can write the 5-byte JMP patch and trampoline yourself. This is the classic
approach used by cleo/plugin-sdk tools:

```/dev/null/manual_hook.d#L1-115
/**
 * Manual x86 trampoline hook in D BetterC
 *
 * For each hook:
 *  1. Allocate a trampoline buffer (VirtualAlloc with PAGE_EXECUTE_READWRITE).
 *  2. Copy the first N bytes (≥ 5) of the target into the trampoline.
 *  3. Append a JMP back to target+N in the trampoline.
 *  4. Patch the first 5 bytes of the target with: E9 <rel32> (JMP to detour).
 */
module manual_hook;

import core.sys.windows.windows;
import core.stdc.string : memcpy;

struct Hook
{
    void*  pTarget;
    void*  pDetour;
    void*  pTrampoline;   // executable buffer; call this to reach original
    ubyte[16] savedBytes; // backup of overwritten bytes (up to 16)
    size_t patchLen;      // number of bytes overwritten (always 5 for near JMP)
}

// Write a 5-byte relative JMP at `from`, jumping to `to`.
// Requires the page to be writable (call VirtualProtect first).
private void writeJmp(void* from, void* to) nothrow @nogc @trusted
{
    ubyte* p = cast(ubyte*) from;
    p[0] = 0xE9;  // JMP rel32
    *cast(int*)(p + 1) = cast(int)(cast(uintptr_t) to
                                  - cast(uintptr_t) from - 5);
}

bool hookInstall(Hook* h, void* pTarget, void* pDetour) nothrow @nogc @trusted
{
    import core.stdc.string : memcpy;

    h.pTarget = pTarget;
    h.pDetour = pDetour;
    h.patchLen = 5;

    // Save original bytes
    memcpy(h.savedBytes.ptr, pTarget, h.patchLen);

    // Allocate executable trampoline (stolen bytes + JMP back)
    enum trampolineSize = 16 + 5;  // 16 bytes max stolen + 5 for JMP
    h.pTrampoline = VirtualAlloc(null, trampolineSize,
                                 MEM_COMMIT | MEM_RESERVE,
                                 PAGE_EXECUTE_READWRITE);
    if (!h.pTrampoline) return false;

    // Copy stolen bytes into trampoline
    memcpy(h.pTrampoline, pTarget, h.patchLen);

    // Append JMP from trampoline back to target+patchLen
    writeJmp(cast(ubyte*) h.pTrampoline + h.patchLen,
             cast(ubyte*) pTarget + h.patchLen);

    // Patch the target: write JMP to detour
    DWORD oldProtect;
    VirtualProtect(pTarget, h.patchLen, PAGE_EXECUTE_READWRITE, &oldProtect);
    writeJmp(pTarget, pDetour);
    VirtualProtect(pTarget, h.patchLen, oldProtect, &oldProtect);

    // Flush instruction cache so CPU sees the new bytes
    FlushInstructionCache(GetCurrentProcess(), pTarget, h.patchLen);
    return true;
}

void hookUninstall(Hook* h) nothrow @nogc @trusted
{
    if (!h.pTarget) return;
    DWORD oldProtect;
    VirtualProtect(h.pTarget, h.patchLen, PAGE_EXECUTE_READWRITE, &oldProtect);
    memcpy(h.pTarget, h.savedBytes.ptr, h.patchLen);
    VirtualProtect(h.pTarget, h.patchLen, oldProtect, &oldProtect);
    FlushInstructionCache(GetCurrentProcess(), h.pTarget, h.patchLen);
    if (h.pTrampoline) VirtualFree(h.pTrampoline, 0, MEM_RELEASE);
    h.pTarget = null;
}
```

**Usage for a cdecl function:**

```/dev/null/use_manual_hook.d#L1-32
// Target: void CStreaming__RequestModel(int modelId, int flags)  @ 0x004087E0
import manual_hook;

__gshared Hook g_reqModelHook;

// Trampoline pointer — call this to invoke the original
__gshared extern (C) void function(int, int) nothrow @nogc original_RequestModel;

extern (C) void detour_RequestModel(int modelId, int flags) nothrow @nogc
{
    // ... your logic ...
    original_RequestModel(modelId, flags);
}

void installHooks() nothrow @nogc
{
    hookInstall(&g_reqModelHook,
                cast(void*) 0x004087E0,
                &detour_RequestModel);

    // Cast trampoline to typed function pointer
    original_RequestModel =
        cast(typeof(original_RequestModel)) g_reqModelHook.pTrampoline;
}
```

> **⚠ Instruction length decoding:** The 5-byte patch assumes the first 5 bytes at the target address contain only
> complete instructions. If a single instruction straddles byte 5, you must copy more bytes. MinHook handles this
> automatically with a length-disassembler. For the manual approach, use a disassembler like `hde32` (a single-file C
> header) bound via `extern(C)` to get the instruction length.

---

## 6. DllMain in D — Full Skeleton

### With druntime (normal D, no `-betterC`)

```/dev/null/dllmain_full.d#L1-50
/**
 * DllMain skeleton for a D ASI plugin WITHOUT -betterC.
 * Uses druntime's DLL helpers for GC and TLS setup.
 * The mixin generates DllMain for you.
 *
 * Compile:  ldc2 -m32 -shared -ofplugin.dll dllmain_full.d
 */
module dllmain_full;

import core.sys.windows.windows;
import core.sys.windows.dll : SimpleDllMain;

// SimpleDllMain expands to a full DllMain that calls:
//   dll_process_attach, dll_process_detach, dll_thread_attach, dll_thread_detach
// These initialize the GC, exception handling, and TLS for each thread.
mixin SimpleDllMain;

// Your plugin's actual startup (called from a shared static constructor,
// which runs after druntime is initialized):
shared static this()
{
    // Safe to use GC here, D arrays, exceptions, etc.
    pluginMain();
}

void pluginMain()
{
    // ...
}
```

### With `-betterC` (recommended for a game plugin)

```/dev/null/dllmain_betterC.d#L1-85
/**
 * Full DllMain skeleton for a D BetterC ASI plugin.
 *
 * Compile:
 *   ldc2 -m32 -shared -betterC -ofplugin.asi dllmain_betterC.d [other_files.d] [libs]
 *
 * Rename output to .asi for ASI loader, or let the build script do it.
 */
module dllmain;

// WinAPI types (safe to import in betterC — these are just declarations)
import core.sys.windows.windef : HINSTANCE, BOOL, DWORD, LPVOID;
import core.sys.windows.winnt  : DLL_PROCESS_ATTACH, DLL_PROCESS_DETACH,
                                  DLL_THREAD_ATTACH,  DLL_THREAD_DETACH;

// Global handle — use __gshared, not TLS
__gshared HINSTANCE g_hInstance;

// Forward declarations for plugin logic (defined in other .d files)
void pluginAttach() nothrow @nogc;
void pluginDetach() nothrow @nogc;

/**
 * DLL entry point.
 *
 * extern(Windows) = __stdcall, which is the correct ABI for DllMain on Win32.
 * The OS calls this via LoadLibrary on DLL_PROCESS_ATTACH.
 * BOOL = int on Win32 (4 bytes). Return TRUE (1) to signal success.
 */
extern (Windows)
BOOL DllMain(HINSTANCE hInstance, DWORD fdwReason, LPVOID lpvReserved)
    nothrow @nogc
{
    switch (fdwReason)
    {
        case DLL_PROCESS_ATTACH:
            g_hInstance = hInstance;
            // Optional: disable per-thread DllMain calls to reduce overhead
            // DisableThreadLibraryCalls(hInstance);
            pluginAttach();
            break;

        case DLL_PROCESS_DETACH:
            // lpvReserved != null means the process is terminating (not FreeLibrary).
            // In that case, you can skip teardown — OS cleans up memory anyway.
            if (lpvReserved is null)
                pluginDetach();
            break;

        case DLL_THREAD_ATTACH:
        case DLL_THREAD_DETACH:
            // Without druntime we don't need to do anything here.
            // If you need per-thread TLS init, do it here manually.
            break;

        default:
            break;
    }
    return 1;  // TRUE
}
```

---

## 7. Known Limitations and Gotchas for D on Win32 (x86)

### 7.1 OMF vs COFF — The Linker Format War

This is the #1 friction point for Win32 D development:

- DMD `-m32` produces **OMF** objects → OPTLINK linker → can only link **OMF `.lib`** files.
- DMD `-m32mscoff` and **all LDC** produce **COFF** objects → MSVC `link.exe` or LLD.
- Every MSVC-compiled library (MinHook, DirectX SDK, Windows SDK) is in **COFF** format.
- **Solution:** Always use LDC `-m32` or DMD `-m32mscoff`. Never use plain DMD `-m32` with external C libraries unless
  you can convert them (`coffimplib`, `coff2omf`).

### 7.2 The 80-bit `real` Type

D's `real` type on x86 is **80-bit extended precision** (x87 `long double`). MSVC does not support 80-bit floats — it
treats `long double` as 64-bit. If you interact with any MSVC-ABI C++ that uses `float` or `double`, use D's `float`
(32-bit) and `double` (64-bit) only. Never pass `real` to extern functions.

### 7.3 Stack Alignment

x86 Win32 calling conventions assume **4-byte stack alignment**. However, LLVM/LDC may emit SSE instructions that
require **16-byte alignment**. Inside GTA III's process, the stack may not be 16-byte aligned when your detour is called
(the game was compiled with MSVC at 4-byte alignment).

**Mitigation:** In LDC, use `-mattr=-sse2` or ensure your detour function entry prologues align the stack. In practice,
most scalar operations are unaffected; the problem arises with auto-vectorized loops. Use `pragma(inline, false)` on
entry points and test.

### 7.4 TLS (Thread-Local Storage) Bugs on Windows < 8.1

LDC's bug tracker records a **TLS alignment bug on Windows versions before 8.1** when using `-m32`. Since GTA III's era
is Windows XP/2000/7, and TLS for loaded DLLs (not the main executable) has historically been buggy, this matters:

- **Avoid `static` / TLS variables entirely** in a betterC DLL. Use `__gshared` globals.
- If you need per-thread data, allocate it manually via `TlsAlloc` / `TlsSetValue` / `TlsGetValue` (WinAPI).

### 7.5 C Runtime Initialization

GTA III ships with its own MSVC CRT (likely `msvcrt.dll` from MSVC 6.0 era). Your DLL will load its own copy of the CRT
(or share it if using the DLL CRT). This means:

- **Do not cross DLL boundaries with CRT objects** (e.g., `malloc` in your DLL vs `free` in the game). Each has its own
  heap.
- In betterC mode, you call `core.stdc.stdlib.malloc` which resolves to the C runtime linked into your DLL — not the
  game's heap. This is correct and safe.
- **Never throw a D exception** (not an issue in betterC — but worth noting if you later drop `-betterC`).

### 7.6 The DllMain Loader Lock

Like any DLL, you must not call `LoadLibrary`, `CreateThread`, or any Phobos/druntime blocking function inside
`DllMain`. Standard Windows rule. This applies equally to D.

**Safe pattern:** In `DllMain(DLL_PROCESS_ATTACH)`, spawn initialization work via `CreateThread` or post to a queue that
runs later. MinHook's `MH_CreateHook` is safe to call from `DllMain` because it only manipulates memory.

### 7.7 ASLR and Hardcoded Addresses

GTA III's original 1.0 EXE does not have ASLR enabled (it predates ASLR). Your hardcoded function addresses (e.g.,
`0x004087E0`) are the virtual addresses from IDA/Ghidra with the default image base (`0x00400000`). They are valid
without rebasing. Verify with:

```/dev/null/verify_base.d#L1-12
import core.sys.windows.windows : GetModuleHandleA;

// At init time, verify image base hasn't moved
void verifyBase() nothrow @nogc
{
    auto base = cast(uintptr_t) GetModuleHandleA(null);
    assert(base == 0x00400000, "Image base mismatch — addresses will be wrong!");
    // On the original GTA III 1.0 EXE without ASLR this should always pass.
}
```

### 7.8 Inline Assembler Portability (DMD vs LDC)

D's `asm { }` blocks use **Intel syntax** on both DMD and LDC (not AT&T). However:

- **DMD inline asm** is processed by DMD's own assembler. It is fairly limited; it does not support all SSE/AVX
  instructions.
- **LDC inline asm** uses LLVM's integrated assembler behind the scenes, called via the same DMD-compatible `asm { }`
  syntax. It supports the full x86 instruction set.
- LDC also supports **GCC extended inline asm** (`__asm("...", ...)`) as an extension, giving you full control over
  input/output constraints.

For the trampoline and thiscall shims in this project, the basic `asm { }` syntax is sufficient and works on both
compilers.

### 7.9 `nothrow @nogc` Hygiene

In betterC mode, every function reachable from `DllMain` should be marked `nothrow @nogc`. The compiler enforces this
transitively in `@safe` code. In `@trusted` or `@system` code, you must enforce it manually. A stray `@gc` allocation
(e.g., a D string concatenation with `~`) will compile but crash at runtime because the GC isn't initialized.

**Pattern to catch this at compile time:**

```/dev/null/nogc_enforcement.d#L1-10
// Use pragma to verify no GC allocations slip through
@nogc nothrow @trusted:

void pluginAttach()
{
    // If you accidentally write:  auto s = "hello" ~ " world";
    // The compiler will error here because ~ on strings allocates.
}
```

---

## Summary Recommendation

| Decision          | Recommendation                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| **Compiler**      | LDC (`ldc2`) — MSVC ABI, COFF output, best Win32 support                        |
| **Mode**          | `-betterC` — no GC, no druntime, minimal binary                                 |
| **Linker**        | MSVC `link.exe` (auto-detected) or LDC's bundled LLD                            |
| **Hooking**       | MinHook via `extern(C)` binding for reliability; manual JMP patch for zero deps |
| **cdecl**         | `extern(C)`                                                                     |
| **stdcall**       | `extern(Windows)`                                                               |
| **thiscall**      | Inline asm shim (portable) or `extern(C++)` struct method (MSVC ABI LDC only)   |
| **Globals**       | Always `__gshared`, never bare `static` in DLL context                          |
| **Object format** | COFF always — never OMF                                                         |

```/dev/null/full_build.cmd#L1-10
rem Full build command for a release ASI plugin
ldc2 ^
    -m32 ^
    -shared ^
    -betterC ^
    -O2 ^
    -release ^
    -oflightrail.dll ^
    src\dllmain.d src\hooks.d src\model.d ^
    lib\MinHook.x86.lib kernel32.lib user32.lib
ren lightrail.dll lightrail.asi
```
