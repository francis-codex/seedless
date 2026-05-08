import { type UniffiRustCallStatus } from 'uniffi-bindgen-react-native';
interface NativeModuleInterface {
    ubrn_uniffi_internal_fn_func_ffi__string_to_byte_length(string: string, uniffi_out_err: UniffiRustCallStatus): number;
    ubrn_uniffi_internal_fn_func_ffi__string_to_arraybuffer(string: string, uniffi_out_err: UniffiRustCallStatus): Uint8Array;
    ubrn_uniffi_internal_fn_func_ffi__arraybuffer_to_string(buffer: Uint8Array, uniffi_out_err: UniffiRustCallStatus): string;
    ubrn_uniffi_mopro_umbra_2_fn_func_generate_circom_proof(zkeyPath: Uint8Array, circuitInputs: Uint8Array, proofLib: Uint8Array, uniffi_out_err: UniffiRustCallStatus): Uint8Array;
    ubrn_uniffi_mopro_umbra_2_fn_func_generate_halo2_proof(srsPath: Uint8Array, pkPath: Uint8Array, circuitInputs: Uint8Array, uniffi_out_err: UniffiRustCallStatus): Uint8Array;
    ubrn_uniffi_mopro_umbra_2_fn_func_generate_noir_proof(circuitPath: Uint8Array, srsPath: Uint8Array, inputs: Uint8Array, onChain: number, vk: Uint8Array, lowMemoryMode: number, uniffi_out_err: UniffiRustCallStatus): Uint8Array;
    ubrn_uniffi_mopro_umbra_2_fn_func_get_noir_verification_key(circuitPath: Uint8Array, srsPath: Uint8Array, onChain: number, lowMemoryMode: number, uniffi_out_err: UniffiRustCallStatus): Uint8Array;
    ubrn_uniffi_mopro_umbra_2_fn_func_verify_circom_proof(zkeyPath: Uint8Array, proofResult: Uint8Array, proofLib: Uint8Array, uniffi_out_err: UniffiRustCallStatus): number;
    ubrn_uniffi_mopro_umbra_2_fn_func_verify_halo2_proof(srsPath: Uint8Array, vkPath: Uint8Array, proof: Uint8Array, publicInput: Uint8Array, uniffi_out_err: UniffiRustCallStatus): number;
    ubrn_uniffi_mopro_umbra_2_fn_func_verify_noir_proof(circuitPath: Uint8Array, proof: Uint8Array, onChain: number, vk: Uint8Array, lowMemoryMode: number, uniffi_out_err: UniffiRustCallStatus): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_generate_circom_proof(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_generate_halo2_proof(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_generate_noir_proof(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_get_noir_verification_key(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_verify_circom_proof(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_verify_halo2_proof(): number;
    ubrn_uniffi_mopro_umbra_2_checksum_func_verify_noir_proof(): number;
    ubrn_ffi_mopro_umbra_2_uniffi_contract_version(): number;
}
declare const getter: () => NativeModuleInterface;
export default getter;
export type UniffiRustFutureContinuationCallback = (data: bigint, pollResult: number) => void;
type UniffiForeignFutureFree = (handle: bigint) => void;
export type UniffiForeignFuture = {
    handle: bigint;
    free: UniffiForeignFutureFree;
};
export type UniffiForeignFutureStructU8 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteU8 = (callbackData: bigint, result: UniffiForeignFutureStructU8) => void;
export type UniffiForeignFutureStructI8 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteI8 = (callbackData: bigint, result: UniffiForeignFutureStructI8) => void;
export type UniffiForeignFutureStructU16 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteU16 = (callbackData: bigint, result: UniffiForeignFutureStructU16) => void;
export type UniffiForeignFutureStructI16 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteI16 = (callbackData: bigint, result: UniffiForeignFutureStructI16) => void;
export type UniffiForeignFutureStructU32 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteU32 = (callbackData: bigint, result: UniffiForeignFutureStructU32) => void;
export type UniffiForeignFutureStructI32 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteI32 = (callbackData: bigint, result: UniffiForeignFutureStructI32) => void;
export type UniffiForeignFutureStructU64 = {
    returnValue: bigint;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteU64 = (callbackData: bigint, result: UniffiForeignFutureStructU64) => void;
export type UniffiForeignFutureStructI64 = {
    returnValue: bigint;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteI64 = (callbackData: bigint, result: UniffiForeignFutureStructI64) => void;
export type UniffiForeignFutureStructF32 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteF32 = (callbackData: bigint, result: UniffiForeignFutureStructF32) => void;
export type UniffiForeignFutureStructF64 = {
    returnValue: number;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteF64 = (callbackData: bigint, result: UniffiForeignFutureStructF64) => void;
export type UniffiForeignFutureStructPointer = {
    returnValue: bigint;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompletePointer = (callbackData: bigint, result: UniffiForeignFutureStructPointer) => void;
export type UniffiForeignFutureStructRustBuffer = {
    returnValue: Uint8Array;
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteRustBuffer = (callbackData: bigint, result: UniffiForeignFutureStructRustBuffer) => void;
export type UniffiForeignFutureStructVoid = {
    callStatus: UniffiRustCallStatus;
};
export type UniffiForeignFutureCompleteVoid = (callbackData: bigint, result: UniffiForeignFutureStructVoid) => void;
//# sourceMappingURL=mopro_umbra_2-ffi.d.ts.map