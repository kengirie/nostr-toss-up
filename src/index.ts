import { SimplePool, Filter, Event, nip19 } from 'nostr-tools';

// Function to check if text contains Japanese characters
function containsJapanese(text: string): boolean {
  // Japanese character ranges:
  // Hiragana: \u3040-\u309F
  // Katakana: \u30A0-\u30FF
  // Kanji: \u4E00-\u9FAF
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  return japaneseRegex.test(text);
}

// Function to check if an event contains Japanese text
function eventContainsJapanese(event: Event): boolean {
  // For kind0 events, check the content field which contains profile metadata
  if (event.kind === 0 && event.content) {
    try {
      const content = JSON.parse(event.content);
      // Check name, about, and other fields for Japanese text
      return (
        (content.name && containsJapanese(content.name)) ||
        (content.about && containsJapanese(content.about)) ||
        (content.display_name && containsJapanese(content.display_name)) ||
        (content.displayName && containsJapanese(content.displayName))
      );
    } catch (e) {
      // If content is not valid JSON, check the raw content
      return containsJapanese(event.content);
    }
  }
  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/message':
        return new Response('Hello, World!');
      case '/random':
        return new Response(crypto.randomUUID());
      case '/collect-japanese-users':
        // Start the collection process in the background
        ctx.waitUntil(collectJapaneseUsers(env));
        return new Response('Collection process started', { status: 200 });
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;

async function collectJapaneseUsers(env: Env): Promise<void> {
  // Create a pool to manage relay connections
  const pool = new SimplePool();

  // Connect to the specified relay
  const relays = ['wss://yabu.me'];

  // Subscribe to kind0 events (profile metadata)
  const filter: Filter = {
    kinds: [0],
  };

  // Create a subscription using the correct method
  const subscription = pool.subscribe(relays, filter, {
    onevent: async (event: Event) => {
      // Check if the event contains Japanese text
      if (eventContainsJapanese(event)) {
        // Extract the pubkey
        const pubkeyHex = event.pubkey;
        const pubkey = nip19.npubEncode(pubkeyHex);

        if (!pubkey) return;

        console.log(`Found Japanese user: ${pubkey}`);

        try {
          // Check if the pubkey exists in the database
          const existingUser = await env.DB.prepare(
            'SELECT pubkey FROM users WHERE pubkey = ?'
          ).bind(pubkey).first();

          // If user doesn't exist, insert them with the current date
          if (!existingUser) {
            const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            await env.DB.prepare(
              'INSERT INTO users (pubkey, registration_date, existing_user) VALUES (?, ?, 0)'
            ).bind(pubkey, currentDate).run();

            console.log(`Added new user with pubkey: ${pubkey}`);
          }
        } catch (error) {
          console.error(`Error processing pubkey ${pubkey}:`, error);
        }
      }
    }
  });

  // Let the subscription run for a while (e.g., 5 minutes)
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

  // Close the subscription and pool
  subscription.close();
  pool.close(relays);
}

// Define the environment interface
interface Env {
  DB: D1Database;
}
