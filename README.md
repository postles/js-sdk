# Postles JS SDK

## Installation
To install the SDK, use Yarn, npm, or a script tag:

- npm
```
npm install @postles/js-sdk
```

- Yarn
```
yarn add @postles/js-sdk
```

script tag

```
<script src="https://unpkg.com/@postles/js-sdk/lib/esm/index.js"></script>
```

## Usage
The SDK can be used both on the server or in the web browser. The main difference is that on the Browser the identified user will be cached vs in Node where you'll need to pass in identifiers on every request.

### Initialize
Before using any methods, the library must be initialized with an API key and URL endpoint.

If you aren't accessing the SDK via script tag, start by importing the Postles SDK:
```typescript

// 
const { Client /** or BrowserClient */ } = require('@postles/js-sdk')

// Or
import { Client /** or BrowserClient */ } from '@postles/js-sdk'
```

Then you can initialize the library:
```typescript
// Node
const client = new Client({
    apiKey: "XXX-XXX",
    urlEndpoint: "https://app.postles.com/api"
})

// Browser
const client = new BrowserClient({
    apiKey: "XXX-XXX",
    urlEndpoint: "https://app.postles.com/api"
})

// Or global script
Postles.initialize({
    apiKey: "XXX-XXX",
    urlEndpoint: "https://app.postles.com/api"
})
```

### Identify
You can handle the user identity of your users by using the `identify` method. This method works in combination to either/or associate a given user to your internal user ID (`external_id`) or to associate attributes (traits) to the user. By default all events and traits are associated with an anonymous ID until a user is identified with an `external_id`. From that point moving forward, all updates to the user and events will be associated to your provider identifier.
```typescript

// Client
client.identify({
    externalId: "XXX-XXX",
    phone: "+1234567890",
    email: "email@email.com",
    traits: {},
})

// Or global script
Postles.identify({
    externalId: "XXX-XXX",
    phone: "+1234567890",
    email: "email@email.com",
    traits: {},
})
```

### Events
If you want to trigger a journey and list updates off of things a user does within your app, you can pass up those events by using the `track` method.
```typescript

// Client
client.track({
    event: "Tapped Button",
    properties: {
        "Key": "Value",
    },
})

// Or global script
Postles.track({
    event: "Tapped Button",
    properties: {
        "Key": "Value",
    },
})
```

### Topics
Read and modify a user's message topics directly through SDK methods. No UI is included, so you can build your own preference center (or manage preferences programmatically).

A **topic** is one thing a user can turn on or off, for example *Daily Recap*. Each channel also has a **master switch** (*All Text Messages*, *All Emails*, *All Push Notifications*) that turns the whole channel off at once; turning it off pauses every topic beneath it without losing the user's choices.

A topic's `state` is `subscribed`, `unsubscribed`, or `not_opted_in`. The last one means an opt-in topic the user has never chosen either way, which is different from having explicitly turned it off. You only ever send back `subscribed` or `unsubscribed`.

In the browser the cached identifiers are used automatically. On the server (`Client`) pass the user's `externalId` (or `anonymousId`) on each call.

#### Rendering a preference center
`getTopicChannels()` returns one section per channel, already grouped, ordered and flagged the way a preference screen renders it. Show the topic toggles only when the channel has more than one topic or any opt-in topic; a channel with a single opt-out topic needs nothing but its master switch. While a channel is paused, leave its topic toggles visible but disabled. Some channels (today, text) can be turned off from your app but only turned back on from the handset. That is what `canResubscribe: false` means, and `resubscribeTextNumber` is the number to text START to.
```typescript
const channels = await Postles.getTopicChannels()

const chosen = new Map()
const remember = row => chosen.set(row.subscriptionId, row.state === 'subscribed' ? 'subscribed' : 'unsubscribed')

for (const channel of channels) {
    if (channel.master) {
        remember(channel.master)
        renderToggle(channel.label, channel.master.state === 'subscribed', {
            onChange: on => chosen.set(channel.master.subscriptionId, on ? 'subscribed' : 'unsubscribed'),
        })
    }

    if (channel.paused && !channel.canResubscribe) {
        renderNotice(`Text START to ${channel.resubscribeTextNumber} to turn these back on.`)
    }

    const worthShowing = channel.topics.length > 1 || channel.topics.some(topic => topic.isOptIn)
    for (const topic of channel.topics) {
        remember(topic)
        if (!worthShowing) continue
        renderToggle(topic.name, topic.state === 'subscribed', {
            disabled: channel.paused,
            onChange: on => chosen.set(topic.subscriptionId, on ? 'subscribed' : 'unsubscribed'),
        })
    }
}
```

#### Saving the screen
`setTopics()` saves the whole screen in one request (up to 100 rows), so two rapid toggles cannot overwrite each other. Submit every master switch that is not locked, plus only the topics whose master was on when the screen rendered. Paused topics are not submitted, otherwise they would all read as off and opt the user out behind their back. Seed the map from the payload rather than from the controls, so a topic you chose not to show still submits the state it already had.
```typescript
const updates = channels.flatMap(channel => [
    ...(channel.master && channel.canResubscribe
        ? [{ subscriptionId: channel.master.subscriptionId, state: chosen.get(channel.master.subscriptionId) }]
        : []),
    ...(channel.paused
        ? []
        : channel.topics.map(topic => ({ subscriptionId: topic.subscriptionId, state: chosen.get(topic.subscriptionId) }))),
])

try {
    await Postles.setTopics({ updates })
} catch (error) {
    if (error instanceof PostlesError && error.code === TOPIC_RESUBSCRIBE_LOCKED) {
        renderNotice(error.message)
    }
}
```

Every failed request throws a `PostlesError` carrying the `status`, the server's `message` and, where the server sent one, a numeric `code`. `TOPIC_RESUBSCRIBE_LOCKED` is the code you get back when you try to turn a handset-only channel on.

#### Other methods
`getTopics()` returns the flat, paginated list (pass the returned `nextCursor` to page) if you would rather group it yourself. `setTopic()`, `subscribeTopic()` and `unsubscribeTopic()` change one topic at a time.
```typescript
// Node (pass the user's identifier on each call)
const page = await client.getTopics({ externalId: "XXX-XXX" })

await client.unsubscribeTopic({
    subscriptionId: 11,
    externalId: "XXX-XXX",
})
```

#### Renamed from subscriptions
What this SDK used to call a subscription is now called a topic. The old names still work and still behave exactly as they did, but they are deprecated and your editor will flag them.

| Old name | Use instead |
|---|---|
| `getSubscriptions()` | `getTopics()` |
| `setSubscription()` | `setTopic()` |
| `SubscriptionState` | `TopicState` |
| `SubscriptionPreference` | `Topic` |
| `SubscriptionPage` | `TopicPage` |

`getSubscriptions()` keeps its old two-state result: it leaves out `kind` and `isOptIn`, and reports a `not_opted_in` topic as `unsubscribed`. Move to `getTopics()` or `getTopicChannels()` to tell those two apart.
