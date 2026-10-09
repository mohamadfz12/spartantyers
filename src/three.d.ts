/**
 * @react-three/fiber augments the global JSX namespace with three.js elements
 * (`<mesh>`, `<group>`, `<meshStandardMaterial>`, …) from inside its own module
 * types. That augmentation only lands if something in the compilation imports
 * the package — which makes it quietly dependent on import order and on no one
 * refactoring the last `useFrame` out of a file.
 *
 * This reference pins it for the whole project so the 3D components keep their
 * types regardless.
 */
/// <reference types="@react-three/fiber" />

export {}
