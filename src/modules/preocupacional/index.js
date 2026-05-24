// Módulo Pre-ocupacional — Entry point

export { renderPreocup } from './preocupacional.js';

import { renderPreocup } from './preocupacional.js';

export const preocupScreenConfig = {
  preocupacional: {
    title: 'Pre-ocupacional',
    btn: null,
    fn: null,
    render: () => renderPreocup(),
  },
};

window.renderPreocup = renderPreocup;
