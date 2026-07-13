// snarkjs is the Umbra SDK's web/node proving backend. It is pulled in by the
// SDK's root barrel (dist/index.js) and cannot be subpath-imported around,
// because createSignerFromPrivateKeyBytes and getUmbraRelayer are only exported
// from the root.
//
// On React Native we never prove with snarkjs — src/umbra/zk/provers/* supply
// native Arkworks provers via @umbra-privacy/rn-zk-prover. snarkjs itself needs
// node builtins and would not run here anyway.
//
// This throws rather than returning a falsy stub on purpose: a silent no-op in a
// proving path would surface as an invalid proof, not a crash.
const unreachable = (path) => {
  throw new Error(
    `snarkjs.${path} was called on React Native. Proving must go through ` +
      `@umbra-privacy/rn-zk-prover (src/umbra/zk/provers/). This is a bug — ` +
      `an SDK code path bypassed the injected prover.`
  );
};

const trap = (prefix) =>
  new Proxy(function () {}, {
    get: (_t, key) =>
      typeof key === 'string' ? trap(`${prefix}.${key}`) : undefined,
    apply: () => unreachable(prefix),
  });

module.exports = {
  groth16: trap('groth16'),
  plonk: trap('plonk'),
  fflonk: trap('fflonk'),
  wtns: trap('wtns'),
  zKey: trap('zKey'),
  powersOfTau: trap('powersOfTau'),
  r1cs: trap('r1cs'),
};
