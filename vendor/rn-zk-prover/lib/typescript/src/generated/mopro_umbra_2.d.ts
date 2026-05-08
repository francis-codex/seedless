import { type UniffiByteArray, RustBuffer, uniffiTypeNameSymbol } from "uniffi-bindgen-react-native";
export declare function generateCircomProof(zkeyPath: string, circuitInputs: string, proofLib: ProofLib): CircomProofResult;
export declare function generateHalo2Proof(srsPath: string, pkPath: string, circuitInputs: Map<string, Array<string>>): Halo2ProofResult;
export declare function generateNoirProof(circuitPath: string, srsPath: string | undefined, inputs: Array<string>, onChain: boolean, vk: ArrayBuffer, lowMemoryMode: boolean): ArrayBuffer;
export declare function getNoirVerificationKey(circuitPath: string, srsPath: string | undefined, onChain: boolean, lowMemoryMode: boolean): ArrayBuffer;
export declare function verifyCircomProof(zkeyPath: string, proofResult: CircomProofResult, proofLib: ProofLib): boolean;
export declare function verifyHalo2Proof(srsPath: string, vkPath: string, proof: ArrayBuffer, publicInput: ArrayBuffer): boolean;
export declare function verifyNoirProof(circuitPath: string, proof: ArrayBuffer, onChain: boolean, vk: ArrayBuffer, lowMemoryMode: boolean): boolean;
export type CircomProof = {
    a: G1;
    b: G2;
    c: G1;
    protocol: string;
    curve: string;
};
/**
 * Generated factory for {@link CircomProof} record objects.
 */
export declare const CircomProof: Readonly<{
    /**
     * Create a frozen instance of {@link CircomProof}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    create: (partial: Partial<CircomProof> & Required<Omit<CircomProof, never>>) => CircomProof;
    /**
     * Create a frozen instance of {@link CircomProof}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    new: (partial: Partial<CircomProof> & Required<Omit<CircomProof, never>>) => CircomProof;
    /**
     * Defaults specified in the {@link mopro_umbra_2} crate.
     */
    defaults: () => Partial<CircomProof>;
}>;
export type CircomProofResult = {
    proof: CircomProof;
    inputs: Array<string>;
};
/**
 * Generated factory for {@link CircomProofResult} record objects.
 */
export declare const CircomProofResult: Readonly<{
    /**
     * Create a frozen instance of {@link CircomProofResult}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    create: (partial: Partial<CircomProofResult> & Required<Omit<CircomProofResult, never>>) => CircomProofResult;
    /**
     * Create a frozen instance of {@link CircomProofResult}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    new: (partial: Partial<CircomProofResult> & Required<Omit<CircomProofResult, never>>) => CircomProofResult;
    /**
     * Defaults specified in the {@link mopro_umbra_2} crate.
     */
    defaults: () => Partial<CircomProofResult>;
}>;
export type G1 = {
    x: string;
    y: string;
    z: string;
};
/**
 * Generated factory for {@link G1} record objects.
 */
export declare const G1: Readonly<{
    /**
     * Create a frozen instance of {@link G1}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    create: (partial: Partial<G1> & Required<Omit<G1, never>>) => G1;
    /**
     * Create a frozen instance of {@link G1}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    new: (partial: Partial<G1> & Required<Omit<G1, never>>) => G1;
    /**
     * Defaults specified in the {@link mopro_umbra_2} crate.
     */
    defaults: () => Partial<G1>;
}>;
export type G2 = {
    x: Array<string>;
    y: Array<string>;
    z: Array<string>;
};
/**
 * Generated factory for {@link G2} record objects.
 */
export declare const G2: Readonly<{
    /**
     * Create a frozen instance of {@link G2}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    create: (partial: Partial<G2> & Required<Omit<G2, never>>) => G2;
    /**
     * Create a frozen instance of {@link G2}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    new: (partial: Partial<G2> & Required<Omit<G2, never>>) => G2;
    /**
     * Defaults specified in the {@link mopro_umbra_2} crate.
     */
    defaults: () => Partial<G2>;
}>;
export type Halo2ProofResult = {
    proof: ArrayBuffer;
    inputs: ArrayBuffer;
};
/**
 * Generated factory for {@link Halo2ProofResult} record objects.
 */
export declare const Halo2ProofResult: Readonly<{
    /**
     * Create a frozen instance of {@link Halo2ProofResult}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    create: (partial: Partial<Halo2ProofResult> & Required<Omit<Halo2ProofResult, never>>) => Halo2ProofResult;
    /**
     * Create a frozen instance of {@link Halo2ProofResult}, with defaults specified
     * in Rust, in the {@link mopro_umbra_2} crate.
     */
    new: (partial: Partial<Halo2ProofResult> & Required<Omit<Halo2ProofResult, never>>) => Halo2ProofResult;
    /**
     * Defaults specified in the {@link mopro_umbra_2} crate.
     */
    defaults: () => Partial<Halo2ProofResult>;
}>;
export declare enum MoproError_Tags {
    CircomError = "CircomError",
    Halo2Error = "Halo2Error",
    NoirError = "NoirError"
}
export declare const MoproError: Readonly<{
    instanceOf: (obj: any) => obj is MoproError;
    CircomError: {
        new (v0: string): {
            readonly tag: MoproError_Tags.CircomError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        "new"(v0: string): {
            readonly tag: MoproError_Tags.CircomError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        instanceOf(obj: any): obj is {
            readonly tag: MoproError_Tags.CircomError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        hasInner(obj: any): obj is {
            readonly tag: MoproError_Tags.CircomError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        getInner(obj: {
            readonly tag: MoproError_Tags.CircomError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        }): Readonly<[string]>;
        isError(error: unknown): error is Error;
    };
    Halo2Error: {
        new (v0: string): {
            readonly tag: MoproError_Tags.Halo2Error;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        "new"(v0: string): {
            readonly tag: MoproError_Tags.Halo2Error;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        instanceOf(obj: any): obj is {
            readonly tag: MoproError_Tags.Halo2Error;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        hasInner(obj: any): obj is {
            readonly tag: MoproError_Tags.Halo2Error;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        getInner(obj: {
            readonly tag: MoproError_Tags.Halo2Error;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        }): Readonly<[string]>;
        isError(error: unknown): error is Error;
    };
    NoirError: {
        new (v0: string): {
            readonly tag: MoproError_Tags.NoirError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        "new"(v0: string): {
            readonly tag: MoproError_Tags.NoirError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        instanceOf(obj: any): obj is {
            readonly tag: MoproError_Tags.NoirError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        hasInner(obj: any): obj is {
            readonly tag: MoproError_Tags.NoirError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        };
        getInner(obj: {
            readonly tag: MoproError_Tags.NoirError;
            readonly inner: Readonly<[string]>;
            /**
             * @private
             * This field is private and should not be used, use `tag` instead.
             */
            readonly [uniffiTypeNameSymbol]: "MoproError";
            name: string;
            message: string;
            stack?: string;
            cause?: unknown;
        }): Readonly<[string]>;
        isError(error: unknown): error is Error;
    };
}>;
export type MoproError = InstanceType<typeof MoproError[keyof Omit<typeof MoproError, 'instanceOf'>]>;
export declare enum ProofLib {
    Arkworks = 0,
    Rapidsnark = 1
}
/**
 * This should be called before anything else.
 *
 * It is likely that this is being done for you by the library's `index.ts`.
 *
 * It checks versions of uniffi between when the Rust scaffolding was generated
 * and when the bindings were generated.
 *
 * It also initializes the machinery to enable Rust to talk back to Javascript.
 */
declare function uniffiEnsureInitialized(): void;
declare const _default: Readonly<{
    initialize: typeof uniffiEnsureInitialized;
    converters: {
        FfiConverterTypeCircomProof: {
            read(from: RustBuffer): CircomProof;
            write(value: CircomProof, into: RustBuffer): void;
            allocationSize(value: CircomProof): number;
            lift(value: UniffiByteArray): CircomProof;
            lower(value: CircomProof): UniffiByteArray;
        };
        FfiConverterTypeCircomProofResult: {
            read(from: RustBuffer): CircomProofResult;
            write(value: CircomProofResult, into: RustBuffer): void;
            allocationSize(value: CircomProofResult): number;
            lift(value: UniffiByteArray): CircomProofResult;
            lower(value: CircomProofResult): UniffiByteArray;
        };
        FfiConverterTypeG1: {
            read(from: RustBuffer): G1;
            write(value: G1, into: RustBuffer): void;
            allocationSize(value: G1): number;
            lift(value: UniffiByteArray): G1;
            lower(value: G1): UniffiByteArray;
        };
        FfiConverterTypeG2: {
            read(from: RustBuffer): G2;
            write(value: G2, into: RustBuffer): void;
            allocationSize(value: G2): number;
            lift(value: UniffiByteArray): G2;
            lower(value: G2): UniffiByteArray;
        };
        FfiConverterTypeHalo2ProofResult: {
            read(from: RustBuffer): Halo2ProofResult;
            write(value: Halo2ProofResult, into: RustBuffer): void;
            allocationSize(value: Halo2ProofResult): number;
            lift(value: UniffiByteArray): Halo2ProofResult;
            lower(value: Halo2ProofResult): UniffiByteArray;
        };
        FfiConverterTypeMoproError: {
            read(from: RustBuffer): MoproError;
            write(value: MoproError, into: RustBuffer): void;
            allocationSize(value: MoproError): number;
            lift(value: UniffiByteArray): MoproError;
            lower(value: MoproError): UniffiByteArray;
        };
        FfiConverterTypeProofLib: {
            read(from: RustBuffer): ProofLib;
            write(value: ProofLib, into: RustBuffer): void;
            allocationSize(value: ProofLib): number;
            lift(value: UniffiByteArray): ProofLib;
            lower(value: ProofLib): UniffiByteArray;
        };
    };
}>;
export default _default;
//# sourceMappingURL=mopro_umbra_2.d.ts.map