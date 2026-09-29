/** How much night it is (0 by day, 1 at midnight), set by render/daynight.ts — its own module so shaders that dress the
 *  night up (the moon on the rivers) can read it without pulling in the renderer. */
export const nightU = { value: 0 };
