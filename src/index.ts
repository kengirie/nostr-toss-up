import { Filter, Event, nip19 } from 'nostr-tools';
import { NostrFetcher } from 'nostr-fetch';

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Function to check if text contains Japanese characters
function containsJapanese(text: string): boolean {
  // Japanese character ranges:
  // Hiragana: \u3040-\u309F
  // Katakana: \u30A0-\u30FF (excluding ツ which is \u30C4)
  // Kanji: \u4E00-\u9FAF
  // Split Katakana range to exclude ツ (U+30C4)
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30C3\u30C5-\u30FF\u4E00-\u9FAF]/;
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

// PageRank calculation parameters
const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD = 0.0001;

// Create a new Hono app
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use('*', cors());


// Function to fetch the last post date for a user
async function fetchLastPostDate(pubkeyHex: string): Promise<number> {
  const fetcher = NostrFetcher.init();
  const relayUrls = ["wss://yabu.me"];

  const events= await fetcher.fetchLatestEvents(
    relayUrls,
    /* filter */
    { kinds: [ 1 ], authors: [pubkeyHex] },
    /* number of events to fetch */
    1,
);

  try {
    if (events.length === 0) {
      return 0;
    }

    return events[0].created_at;
  } catch (error) {
    console.error(`Error fetching last post date for ${pubkeyHex}:`, error);
    return 0;
  }
}

// Function to collect and save last post dates for all users
async function collectLastPostDates(env: Env): Promise<void> {
  try {
    // Get all users from the database
    const usersResult = await env.DB.prepare('SELECT pubkey FROM users').all();
    const users = usersResult.results.map(user => user.pubkey);

    // Convert npub to hex for nostr-tools
    const userHexMap = new Map<string, string>(); // npub -> hex

    for (const npub of users) {
      try {
        // Skip if not a valid npub
        if (!npub || typeof npub !== 'string' || !npub.startsWith('npub')) continue;

        const decoded = nip19.decode(npub);
        const hex = decoded.data as string;
        userHexMap.set(npub, hex);
      } catch (error) {
        console.error(`Error decoding npub ${npub}:`, error);
      }
    }

    console.log(`Fetching last post dates for ${userHexMap.size} users...`);

    // Process users in batches to avoid overwhelming the relays
    const BATCH_SIZE = 10;
    const userEntries = Array.from(userHexMap.entries());

    for (let i = 0; i < userEntries.length; i += BATCH_SIZE) {
      const batch = userEntries.slice(i, i + BATCH_SIZE);

      // Fetch last post dates in parallel
      const lastPostPromises = batch.map(([npub, hex]) =>
        fetchLastPostDate(hex).then(timestamp => ({ npub, timestamp }))
      );

      const results = await Promise.all(lastPostPromises);

      // Save results to database
      for (const { npub, timestamp } of results) {
        if (timestamp > 0) {
          // Insert or update the last post date
          await env.DB.prepare(
            'INSERT OR REPLACE INTO last_posts (pubkey, last_post_date) VALUES (?, ?)'
          ).bind(npub, timestamp).run();
        }
      }

      console.log(`Processed ${i + batch.length}/${userEntries.length} users`);
    }

    console.log('Last post dates collection completed');
  } catch (error) {
    console.error('Error collecting last post dates:', error);
  }
}

// Define routes
app.get('/message', () => new Response('Hello, World!'));
app.get('/random', () => new Response(crypto.randomUUID()));
app.get('/collect-japanese-users', (c) => {
  // Start the collection process in the background
  c.executionCtx.waitUntil(collectJapaneseUsers(c.env));
  return new Response('Collection process started', { status: 200 });
});

// New endpoint to get new users (registered within 30 days and existing_user=0)
app.get('/new-users', async (c) => {
  try {
    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Query the database for new users
    const newUsers = await c.env.DB.prepare(
      'SELECT pubkey FROM users WHERE registration_date >= ? AND existing_user = 0'
    ).bind(thirtyDaysAgoStr).all();

    // Extract pubkeys and return as JSON array
    const pubkeys = newUsers.results.map(user => user.pubkey);

    return Response.json(pubkeys);
  } catch (error) {
    console.error('Error fetching new users:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get only pubkeys of new users
app.get('/new-users-pubkey', async (c) => {
  try {
    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Query the database for new users, selecting only pubkey
    const newUsers = await c.env.DB.prepare(
      'SELECT pubkey FROM users WHERE registration_date >= ? AND existing_user = 0'
    ).bind(thirtyDaysAgoStr).all();

    // Extract pubkeys and return as JSON array of strings
    const pubkeys = newUsers.results.map(user => user.pubkey);

    return Response.json(pubkeys);
  } catch (error) {
    console.error('Error fetching new users pubkeys:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get popular users (high PageRank score)
app.get('/popular-users', async (c) => {
  try {
    // Check if we have PageRank scores in the database
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM pagerank_scores'
    ).first();

    // If no scores, calculate PageRank
    if (!result || result.count === 0) {
      // Start calculation in background
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // Get top 10 users by PageRank score
    const popularUsers = await c.env.DB.prepare(
      'SELECT pubkey, score FROM pagerank_scores ORDER BY score DESC LIMIT 10'
    ).all();

    return Response.json(popularUsers.results);
  } catch (error) {
    console.error('Error fetching popular users:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get only pubkeys of popular users
app.get('/popular-users-pubkey', async (c) => {
  try {
    // Check if we have PageRank scores in the database
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM pagerank_scores'
    ).first();

    // If no scores, calculate PageRank
    if (!result || result.count === 0) {
      // Start calculation in background
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // Get top 10 users by PageRank score, selecting only pubkey
    const popularUsers = await c.env.DB.prepare(
      'SELECT pubkey FROM pagerank_scores ORDER BY score DESC LIMIT 10'
    ).all();

    // Extract pubkeys and return as JSON array of strings
    const pubkeys = popularUsers.results.map(user => user.pubkey);

    return Response.json(pubkeys);
  } catch (error) {
    console.error('Error fetching popular users pubkeys:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get isolated users (low PageRank score)
app.get('/isolated-users', async (c) => {
  try {
    // Check if we have PageRank scores in the database
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM pagerank_scores'
    ).first();

    // If no scores, calculate PageRank
    if (!result || result.count === 0) {
      // Start calculation in background
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // Get bottom 10 users by PageRank score
    const isolatedUsers = await c.env.DB.prepare(
      'SELECT pubkey, score FROM pagerank_scores ORDER BY score ASC LIMIT 10'
    ).all();

    return Response.json(isolatedUsers.results);
  } catch (error) {
    console.error('Error fetching isolated users:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get only pubkeys of isolated users
app.get('/isolated-users-pubkey', async (c) => {
  try {
    // Check if we have PageRank scores in the database
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM pagerank_scores'
    ).first();

    // If no scores, calculate PageRank
    if (!result || result.count === 0) {
      // Start calculation in background
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // Get bottom 10 users by PageRank score, selecting only pubkey
    const isolatedUsers = await c.env.DB.prepare(
      'SELECT pubkey FROM pagerank_scores ORDER BY score ASC LIMIT 10'
    ).all();

    // Extract pubkeys and return as JSON array of strings
    const pubkeys = isolatedUsers.results.map(user => user.pubkey);

    return Response.json(pubkeys);
  } catch (error) {
    console.error('Error fetching isolated users pubkeys:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to recalculate PageRank
app.get('/calculate-pagerank', (c) => {
  // Start the calculation process in the background
  c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
  return new Response('PageRank calculation started', { status: 200 });
});

// Endpoint to collect last post dates
app.get('/collect-last-posts', (c) => {
  // Start the collection process in the background
  c.executionCtx.waitUntil(collectLastPostDates(c.env));
  return new Response('Last post dates collection started', { status: 200 });
});

// Endpoint to get users with their last post dates
app.get('/last-posts', async (c) => {
  try {
    // Check if we have last post dates in the database
    const result = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM last_posts'
    ).first();

    // If no data, start collection
    if (!result || result.count === 0) {
      // Start collection in background
      c.executionCtx.waitUntil(collectLastPostDates(c.env));
      return new Response('Last post dates collection started. Please try again in a few minutes.', { status: 202 });
    }

    // Get all users with their last post dates
    const lastPosts = await c.env.DB.prepare(
      'SELECT pubkey, last_post_date FROM last_posts ORDER BY last_post_date DESC'
    ).all();

    return Response.json(lastPosts.results);
  } catch (error) {
    console.error('Error fetching last post dates:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get users with recent posts (within 30 days) and low PageRank scores
app.get('/recent-isolated-users', async (c) => {
  try {
    // Calculate the date 30 days ago in UNIX timestamp (seconds)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    // Check if we have both PageRank scores and last post dates
    const pageRankResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM pagerank_scores'
    ).first();

    const lastPostsResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM last_posts'
    ).first();

    // If no PageRank data, start calculation
    if (!pageRankResult || pageRankResult.count === 0) {
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // If no last post data, start collection
    if (!lastPostsResult || lastPostsResult.count === 0) {
      c.executionCtx.waitUntil(collectLastPostDates(c.env));
      return new Response('Last post dates collection started. Please try again in a few minutes.', { status: 202 });
    }

    // Get users with recent posts and low PageRank scores - optimized with subquery
    const recentIsolatedUsers = await c.env.DB.prepare(`
      SELECT lp.pubkey, lp.last_post_date, pr.score
      FROM (
        SELECT pubkey, last_post_date
        FROM last_posts
        WHERE last_post_date > ?
        -- Filter first to reduce the number of rows before joining
      ) lp
      JOIN pagerank_scores pr ON lp.pubkey = pr.pubkey
      ORDER BY pr.score ASC
      LIMIT 10
    `).bind(thirtyDaysAgo).all();

    return Response.json(recentIsolatedUsers.results);
  } catch (error) {
    console.error('Error fetching recent isolated users:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Endpoint to get only pubkeys of users with recent posts and low PageRank scores
app.get('/recent-isolated-users-pubkey', async (c) => {
  try {
    // Calculate the date 30 days ago in UNIX timestamp (seconds)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    // Check if we have both PageRank scores and last post dates
    const [pageRankResult, lastPostsResult] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM pagerank_scores').first(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM last_posts').first()
    ]);

    // If no PageRank data, start calculation
    if (!pageRankResult || pageRankResult.count === 0) {
      c.executionCtx.waitUntil(calculateAndSavePageRank(c.env));
      return new Response('PageRank calculation started. Please try again in a few minutes.', { status: 202 });
    }

    // If no last post data, start collection
    if (!lastPostsResult || lastPostsResult.count === 0) {
      c.executionCtx.waitUntil(collectLastPostDates(c.env));
      return new Response('Last post dates collection started. Please try again in a few minutes.', { status: 202 });
    }

    // Get users with recent posts and low PageRank scores - optimized with subquery, selecting only pubkey
    const recentIsolatedUsers = await c.env.DB.prepare(`
      SELECT lp.pubkey
      FROM (
        SELECT pubkey, last_post_date
        FROM last_posts
        WHERE last_post_date > ?
        -- Filter first to reduce the number of rows before joining
      ) lp
      JOIN pagerank_scores pr ON lp.pubkey = pr.pubkey
      ORDER BY pr.score ASC
      LIMIT 10
    `).bind(thirtyDaysAgo).all();

    // Extract pubkeys and return as JSON array of strings
    const pubkeys = recentIsolatedUsers.results.map(user => user.pubkey);

    return Response.json(pubkeys);
  } catch (error) {
    console.error('Error fetching recent isolated users pubkeys:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

// Default 404 handler
app.notFound(() => new Response('Not Found', { status: 404 }));

// Cloudflare Workers handler with scheduled tasks
const handler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = controller.cron;
    
    // Hourly tasks (every hour)
    if (cron === '0 * * * *') {
      console.log('Running hourly scheduled tasks...');
      
      // Run all three tasks in parallel
      await Promise.all([
        collectJapaneseUsers(env),
        calculateAndSavePageRank(env),
        collectLastPostDates(env)
      ]);
      
      console.log('Hourly scheduled tasks completed');
    }
  }
};

export default handler;

async function collectJapaneseUsers(env: Env): Promise<void> {

const nHoursAgo = (hrs: number): number =>
  Math.floor((Date.now() - hrs * 60 * 60 * 1000) / 1000);

const fetcher = NostrFetcher.init();
const relayUrls = ["wss://yabu.me"];

const postIter = fetcher.allEventsIterator(
    relayUrls,
    /* filter (kinds, authors, ids, tags) */
    { kinds: [ 0 ] },
    /* time range filter (since, until) */
    { since: nHoursAgo(24) },
    /* fetch options (optional) */
    { skipFilterMatching: true }
);



  for await (const event of postIter) {
    console.log('onevent', event);
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

}

// Function to fetch kind3 events (follow lists) for a user
async function fetchFollowList(pubkeyHex: string): Promise<string[]> {
  const fetcher = NostrFetcher.init();
const relayUrls = ["wss://yabu.me"];


  const events= await fetcher.fetchLatestEvents(
    relayUrls,
    /* filter */
    { kinds: [ 3 ], authors: [pubkeyHex] },
    /* number of events to fetch */
    1,
);

  try {


    if (events.length === 0) {
      return [];
    }

    // Sort events by created_at (descending) to get the most recent one
    events.sort((a, b) => b.created_at - a.created_at);

    // Extract the list of followed pubkeys from the tags
    const followList = events[0].tags
      .filter((tag: string[]) => tag[0] === 'p')
      .map((tag: string[]) => tag[1]);

    return followList;
  } catch (error) {
    console.error(`Error fetching follow list for ${pubkeyHex}:`, error);
    return [];
  }
}

// Function to calculate PageRank and save results to database
async function calculateAndSavePageRank(env: Env): Promise<void> {
  try {
    // Get all users from the database
    const usersResult = await env.DB.prepare('SELECT pubkey FROM users').all();
    const users = usersResult.results.map(user => user.pubkey);

    // Convert npub to hex for nostr-tools
    const userHexMap = new Map<string, string>(); // npub -> hex
    const userNpubMap = new Map<string, string>(); // hex -> npub

    for (const npub of users) {
      try {
        // Skip if not a valid npub
        if (!npub || typeof npub !== 'string' || !npub.startsWith('npub')) continue;

        const decoded = nip19.decode(npub);
        const hex = decoded.data as string;
        userHexMap.set(npub, hex);
        userNpubMap.set(hex, npub);
      } catch (error) {
        console.error(`Error decoding npub ${npub}:`, error);
      }
    }

    // Fetch follow lists for all users
    const followGraph = new Map<string, string[]>(); // hex -> [hex, hex, ...]
    const userHexes = Array.from(userHexMap.values());

    console.log(`Fetching follow lists for ${userHexes.length} users...`);

    // Process users in batches to avoid overwhelming the relays
    const BATCH_SIZE = 10;
    for (let i = 0; i < userHexes.length; i += BATCH_SIZE) {
      const batch = userHexes.slice(i, i + BATCH_SIZE);

      // Fetch follow lists in parallel
      const followListsPromises = batch.map(hex => fetchFollowList(hex));
      const followLists = await Promise.all(followListsPromises);

      // Add to the graph
      for (let j = 0; j < batch.length; j++) {
        followGraph.set(batch[j], followLists[j]);
      }

      console.log(`Processed ${i + batch.length}/${userHexes.length} users`);
    }

    // Calculate PageRank
    const pageRankScores = calculatePageRank(followGraph, userHexes);

    // Convert scores to array of objects with npub
    const scoreArray = userHexes.map(hex => ({
      pubkey: userNpubMap.get(hex) || hex,
      score: pageRankScores.get(hex) || 0,
      rank: 0 // Initialize rank property
    }));

    // Sort by score
    scoreArray.sort((a, b) => b.score - a.score);

    // Assign ranks
    scoreArray.forEach((user, index) => {
      user['rank'] = index + 1;
    });

    // Clear existing scores
    await env.DB.prepare('DELETE FROM pagerank_scores').run();

    // Insert scores in batches
    const SAVE_BATCH_SIZE = 100;
    for (let i = 0; i < scoreArray.length; i += SAVE_BATCH_SIZE) {
      const batch = scoreArray.slice(i, i + SAVE_BATCH_SIZE);

      // Create a transaction
      const stmt = env.DB.prepare(
        'INSERT INTO pagerank_scores (pubkey, score, rank) VALUES (?, ?, ?)'
      );

      // Execute batch statements
      await env.DB.batch(batch.map(user =>
        stmt.bind(user.pubkey, user.score, user.rank)
      ));

      console.log(`Saved ${i + batch.length}/${scoreArray.length} scores`);
    }

    console.log('PageRank calculation and saving completed');
  } catch (error) {
    console.error('Error calculating PageRank:', error);
  }
}

// Function to calculate PageRank
function calculatePageRank(
  followGraph: Map<string, string[]>,
  nodes: string[]
): Map<string, number> {
  // Initialize scores
  const scores = new Map<string, number>();
  nodes.forEach(node => scores.set(node, 1.0 / nodes.length));

  // Create a map of incoming links
  const incomingLinks = new Map<string, string[]>();
  nodes.forEach(node => incomingLinks.set(node, []));

  // Populate incoming links
  followGraph.forEach((followList, follower) => {
    followList.forEach(following => {
      // Only consider nodes in our set
      if (nodes.includes(following)) {
        const incoming = incomingLinks.get(following) || [];
        incoming.push(follower);
        incomingLinks.set(following, incoming);
      }
    });
  });

  // Calculate outgoing link counts
  const outgoingCounts = new Map<string, number>();
  followGraph.forEach((followList, node) => {
    // Count only links to nodes in our set
    const validOutLinks = followList.filter(target => nodes.includes(target));
    outgoingCounts.set(node, validOutLinks.length);
  });

  // PageRank iteration
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const newScores = new Map<string, number>();
    let convergence = 0;

    // Initialize with random jump probability
    nodes.forEach(node => {
      newScores.set(node, (1 - DAMPING_FACTOR) / nodes.length);
    });

    // Add contribution from incoming links
    nodes.forEach(node => {
      const incoming = incomingLinks.get(node) || [];

      incoming.forEach(source => {
        const outCount = outgoingCounts.get(source) || 0;
        if (outCount > 0) {
          const currentScore = newScores.get(node) || 0;
          const contribution = DAMPING_FACTOR * (scores.get(source) || 0) / outCount;
          newScores.set(node, currentScore + contribution);
        }
      });

      // Calculate convergence
      const oldScore = scores.get(node) || 0;
      const newScore = newScores.get(node) || 0;
      convergence += Math.abs(newScore - oldScore);
    });

    // Update scores
    nodes.forEach(node => {
      scores.set(node, newScores.get(node) || 0);
    });

    // Check for convergence
    if (convergence < CONVERGENCE_THRESHOLD) {
      console.log(`PageRank converged after ${iteration + 1} iterations`);
      break;
    }
  }

  return scores;
}

// Define the environment interface
interface Env {
  DB: D1Database;
}
