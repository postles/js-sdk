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

### In-App Messages
In-app messages are fetched for you: pass an `onInAppMessage` handler when you initialize and the browser client checks for waiting messages every time the tab becomes visible. Messages belong to a known user, so the first check happens when you call `identify`, and the browser anonymous id is new on every page load, so an unidentified visitor is never checked. Checks are limited to one every 30 seconds, a failed check does not use up that window, and rendering a message is up to you, since the SDK ships no UI.

```typescript
Postles.initialize({
    apiKey: "XXX-XXX",
    urlEndpoint: "https://app.postles.com/api",
    onInAppMessage: notification => {
        console.log(notification.content.title, notification.content.body)

        // Mark it as read once it has been shown, so it is not returned again
        Postles.consumeNotification({ notificationId: notification.id })
    },
    onInAppError: error => {
        console.warn("Postles in-app check failed", error)
    },
})

// The first check runs once the user is known
Postles.identify({ externalId: "XXX-XXX", traits: {} })
```

Set `fetchInAppOnForeground: false` to turn the automatic checks off and call `getNotifications` on your own schedule instead. On the server (`Client`) nothing is automatic: pass the user's `externalId` (or `anonymousId`) to `getNotifications` on each call.

### Subscription Preferences
Read and modify a user's subscription preferences directly through SDK methods — no UI is included, so you can build your own preference center (or manage preferences programmatically). `getSubscriptions` returns the project's public subscriptions along with the current user's state for each, and `setSubscription` flips a single subscription between `subscribed` and `unsubscribed`.

In the browser the cached identifiers are used automatically. On the server (`Client`) pass the user's `externalId` (or `anonymousId`) on each call.
```typescript

// Browser (uses the cached identifiers)
const { results } = await Postles.getSubscriptions()
results.forEach(pref => {
    console.log(pref.name, pref.channel, pref.state)
})

await Postles.setSubscription({
    subscriptionId: 123,
    state: "unsubscribed",
})

// Node (pass the user's identifier on each call)
const page = await client.getSubscriptions({ externalId: "XXX-XXX" })

await client.setSubscription({
    subscriptionId: 123,
    state: "subscribed",
    externalId: "XXX-XXX",
})
```
