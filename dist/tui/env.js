/** Terminal feature toggles (mirrors t1code-style env overrides). */
export function readBooleanEnv(value) {
    if (!value)
        return undefined;
    const n = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(n))
        return true;
    if (['0', 'false', 'no', 'off'].includes(n))
        return false;
    return undefined;
}
export function shouldUseKittyKeyboard(env = process.env) {
    const forced = readBooleanEnv(env.PIXELPHOTO_USE_KITTY_KEYBOARD);
    if (forced !== undefined)
        return forced;
    // Default off: on Ghostty, Kitty protocol + OpenTUI produced noisy input and visible garbage.
    // Opt in: PIXELPHOTO_USE_KITTY_KEYBOARD=1
    return false;
}
export function shouldUseAlternateScreen(env = process.env) {
    return readBooleanEnv(env.PIXELPHOTO_USE_ALTERNATE_SCREEN) ?? true;
}
export function shouldUseMouse(env = process.env) {
    return readBooleanEnv(env.PIXELPHOTO_USE_MOUSE) ?? true;
}
export function shouldEnableMouseMovement(env = process.env) {
    // Default off: SGR mouse-move floods stdin; click/scroll still work (useMouse).
    // Opt in: PIXELPHOTO_ENABLE_MOUSE_MOVEMENT=1 for hover-driven UI.
    return readBooleanEnv(env.PIXELPHOTO_ENABLE_MOUSE_MOVEMENT) ?? false;
}
