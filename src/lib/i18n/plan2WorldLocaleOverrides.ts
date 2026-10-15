/** Fork-specific copy that intentionally differs from upstream OpenPlan3D wording. */
export const plan2WorldLocaleOverrides = {
  en: {
    'viewerNav.mouseUnavailable': 'Mouse look is unavailable in this browser. Use WASD or the arrow keys to move.',
    'viewerNav.walkHelp': 'WASD to move • Arrow keys also move • Mouse to look • Shift to sprint • ESC to exit',
  },
  pt: {
    'viewerNav.mouseUnavailable': 'Não é possível olhar com o mouse neste navegador. Use WASD ou as setas para se mover.',
    'viewerNav.walkHelp': 'WASD para mover • Setas também movem • Mouse para olhar • Shift para correr • Esc para sair',
  },
} as const;
