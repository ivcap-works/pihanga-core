// type RegisterCbk = (register: PiRegister) => void;

// // These remain private and shared across all imports
// let registerF: PiRegister | null = null;
// let pendingRegistrations: RegisterCbk[] = [];
// const MAX_BUFFER_SIZE = 100; // Prevent memory leaks

// export function registerCallback<T>(cb: RegisterCbk): void {
//   registerF = cb;

//   // Flush buffer
//   while (pendingRegistrations.length > 0) {
//     const cbk = pendingRegistrations.shift();
//     if (cbk) {
//       cbk(registerF);
//     }
//   }
// }

// export function register(cbk: RegisterCbk): void {
//   if (registerF) {
//     cbk(registerF);
//   } else {
//     pendingRegistrations.push(cbk);
//   }
// }

// // Added: Helper to clear the buffer if needed
// export function clearPendingRegistration(): void {
//   pendingRegistrations = [];
// }
