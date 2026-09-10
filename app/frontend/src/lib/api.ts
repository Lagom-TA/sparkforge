import { createClient } from '@metagptx/web-sdk';

// Opaque application frames must never enter the SDK's authentication message channel.
// Capture runs before the SDK's bubble listener, including messages queued by removed frames.
window.addEventListener('message', event => {
  if (event.origin === 'null' && typeof event.data?.type === 'string' && event.data.type.startsWith('mgx-')) {
    event.stopImmediatePropagation();
  }
}, true);

// Create client instance
export const client = createClient();
