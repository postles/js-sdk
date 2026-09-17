type ClientProps = {
    apiKey: string
    urlEndpoint: string
}

type TrackProps = {
    event: string
    anonymousId?: string
    externalId?: string
    properties: Record<string, any>
}

type IdentifyProps = {
    anonymousId?: string
    externalId: string
    phone?: string
    email?: string
    timezone?: string
    locale?: string
    traits: Record<string, any>
}

type AliasProps = {
    anonymousId: string
    externalId: string
}

type BrowserAliasProps = {
    anonymousId?: string
    externalId: string
}

type Identity = {
    anonymousId?: string
    externalId?: string
}

export type TopicKind = 'channel' | 'topic'

export type TopicState = 'subscribed' | 'unsubscribed' | 'not_opted_in'

export type Topic = {
    subscriptionId: number
    name: string
    channel: string
    kind: TopicKind
    isOptIn: boolean
    state: TopicState
}

export type TopicPage = {
    results: Topic[]
    nextCursor?: string
    prevCursor?: string
    limit: number
}

export type TopicChannel = {
    channel: string
    label: string
    master: Topic | null
    topics: Topic[]
    paused: boolean
    canResubscribe: boolean
    resubscribeTextNumber?: string | null
}

export type TopicUpdate = {
    subscriptionId: number
    state: Exclude<TopicState, 'not_opted_in'>
}

/** @deprecated Use {@link TopicState}, which also carries `not_opted_in`. */
export type SubscriptionState = Exclude<TopicState, 'not_opted_in'>

/** @deprecated Use {@link Topic}, which also carries `kind` and `isOptIn`. */
export type SubscriptionPreference = {
    subscriptionId: number
    name: string
    channel: string
    state: SubscriptionState
}

/** @deprecated Use {@link TopicPage}. */
export type SubscriptionPage = {
    results: SubscriptionPreference[]
    nextCursor?: string
    prevCursor?: string
    limit: number
}

type GetTopicsProps = Identity & {
    cursor?: string
    limit?: number
}

type GetTopicChannelsProps = Identity

type SetTopicProps = Identity & TopicUpdate

type SetTopicsProps = Identity & {
    updates: TopicUpdate[]
}

type ToggleTopicProps = Identity & {
    subscriptionId: number
}

type GetSubscriptionsProps = GetTopicsProps

type SetSubscriptionProps = SetTopicProps

type RequestOptions = {
    method?: string
    body?: unknown
    query?: Record<string, string | number | undefined>
    headers?: Record<string, string | undefined>
}

export const TOPIC_RESUBSCRIBE_LOCKED = 4004

export class PostlesError extends Error {
    readonly status: number
    readonly code?: number

    constructor(status: number, message: string, code?: number) {
        super(message)
        this.name = 'PostlesError'
        this.status = status
        this.code = code
    }
}

const identityHeaders = ({ anonymousId, externalId }: Identity) => ({
    'x-anonymous-id': anonymousId,
    'x-external-id': externalId,
})

const toTopic = (item: any): Topic => ({
    subscriptionId: item.subscription_id,
    name: item.name,
    channel: item.channel,
    kind: item.kind ?? 'topic',
    isOptIn: item.is_opt_in ?? false,
    state: item.state,
})

const toTopicChannel = (group: any): TopicChannel => {
    const channel: TopicChannel = {
        channel: group.channel,
        label: group.label,
        master: group.master ? toTopic(group.master) : null,
        topics: (group.topics ?? []).map(toTopic),
        paused: group.paused ?? false,
        canResubscribe: group.can_resubscribe ?? true,
    }
    if (group.resubscribe_text_number !== undefined) {
        channel.resubscribeTextNumber = group.resubscribe_text_number
    }
    return channel
}

const toSubscriptionPreference = ({ subscriptionId, name, channel, state }: Topic): SubscriptionPreference => ({
    subscriptionId,
    name,
    channel,
    state: state === 'subscribed' ? 'subscribed' : 'unsubscribed',
})

const errorMessage = (body: any): string | undefined => {
    if (typeof body?.error === 'string' && body.error) return body.error
    if (typeof body?.error?.message === 'string' && body.error.message) return body.error.message
    return undefined
}

const toPostlesError = (path: string, status: number, text: string): PostlesError => {
    let body: any
    try {
        body = JSON.parse(text)
    } catch {
        body = undefined
    }
    return new PostlesError(
        status,
        errorMessage(body) ?? `Postles /client/${path} failed (${status}): ${text}`,
        typeof body?.code === 'number' ? body.code : undefined,
    )
}

export class Client {
    #apiKey: string
    #urlEndpoint: string

    constructor(props: ClientProps) {
        this.#apiKey = props.apiKey
        this.#urlEndpoint = props.urlEndpoint
    }

    async track({ event, properties, anonymousId, externalId }: TrackProps): Promise<void> {
        await this.#request('events', { body: [{
            name: event,
            anonymous_id: anonymousId,
            external_id: externalId,
            data: properties,
        }] })
    }

    async identify({ traits, anonymousId, externalId, phone, email, timezone, locale }: IdentifyProps): Promise<void> {
        await this.#request('identify', { body: {
            anonymous_id: anonymousId,
            external_id: externalId,
            phone,
            email,
            timezone,
            locale,
            data: traits,
        } })
    }

    async alias({ anonymousId, externalId }: AliasProps): Promise<void> {
        await this.#request('alias', { body: {
            anonymous_id: anonymousId,
            external_id: externalId,
        } })
    }

    async getTopics({ anonymousId, externalId, cursor, limit }: GetTopicsProps = {}): Promise<TopicPage> {
        const page = await this.#request('subscriptions', {
            method: 'GET',
            query: { cursor, limit },
            headers: identityHeaders({ anonymousId, externalId }),
        })
        return {
            results: (page?.results ?? []).map(toTopic),
            nextCursor: page?.nextCursor,
            prevCursor: page?.prevCursor,
            limit: page?.limit,
        }
    }

    async getTopicChannels({ anonymousId, externalId }: GetTopicChannelsProps = {}): Promise<TopicChannel[]> {
        const body = await this.#request('subscriptions/channels', {
            method: 'GET',
            headers: identityHeaders({ anonymousId, externalId }),
        })
        return (body?.channels ?? []).map(toTopicChannel)
    }

    async setTopic({ subscriptionId, state, anonymousId, externalId }: SetTopicProps): Promise<void> {
        await this.#request(`subscriptions/${subscriptionId}`, {
            method: 'PUT',
            body: {
                anonymous_id: anonymousId,
                external_id: externalId,
                state,
            },
        })
    }

    /** The server applies at most 100 updates per call, as one read-modify-write. */
    async setTopics({ updates, anonymousId, externalId }: SetTopicsProps): Promise<void> {
        await this.#request('subscriptions', {
            method: 'PUT',
            body: updates.map(({ subscriptionId, state }) => ({
                subscription_id: subscriptionId,
                state,
            })),
            headers: identityHeaders({ anonymousId, externalId }),
        })
    }

    async subscribeTopic(props: ToggleTopicProps): Promise<void> {
        await this.setTopic({ ...props, state: 'subscribed' })
    }

    async unsubscribeTopic(props: ToggleTopicProps): Promise<void> {
        await this.setTopic({ ...props, state: 'unsubscribed' })
    }

    /** @deprecated Use {@link Client.getTopics}. Drops `kind` and `isOptIn`, and reports `not_opted_in` as `unsubscribed`. */
    async getSubscriptions(props: GetSubscriptionsProps = {}): Promise<SubscriptionPage> {
        const page = await this.getTopics(props)
        return { ...page, results: page.results.map(toSubscriptionPreference) }
    }

    /** @deprecated Use {@link Client.setTopic}. */
    async setSubscription(props: SetSubscriptionProps): Promise<void> {
        await this.setTopic(props)
    }

    async #request(path: string, { method = 'POST', body, query, headers }: RequestOptions = {}) {
        let url = `${this.#urlEndpoint}/client/${path}`
        if (query) {
            const params = new URLSearchParams()
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined) params.set(key, String(value))
            }
            const qs = params.toString()
            if (qs) url += `?${qs}`
        }
        const requestHeaders: Record<string, string> = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.#apiKey}`,
        }
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                if (value !== undefined) requestHeaders[key] = value
            }
        }
        const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        })
        const text = await response.text()
        if (!response.ok) {
            throw toPostlesError(path, response.status, text)
        }
        return text ? JSON.parse(text) : undefined
    }
}

export class BrowserClient extends Client {

    #anonymousId: string = this.uuid()
    #externalId?: string
    #client: Client

    constructor(props: ClientProps) {
        super(props)
        this.#client = new Client(props)
    }

    async track(props: TrackProps) {
        return await this.#client.track({
            ...props,
            anonymousId: props.anonymousId ?? this.#anonymousId,
            externalId: props.externalId ?? this.#externalId,
        })
    }

    async identify(props: IdentifyProps) {
        this.#externalId = props.externalId
        return await this.#client.identify({
            ...props,
            anonymousId: props.anonymousId ?? this.#anonymousId,
        })
    }

    async alias(props: BrowserAliasProps) {
        this.#externalId = props.externalId
        return await this.#client.alias({
            anonymousId: props.anonymousId ?? this.#anonymousId,
            externalId: props.externalId,
        })
    }

    async getTopics(props: GetTopicsProps = {}) {
        return await this.#client.getTopics({ ...props, ...this.#identity(props) })
    }

    async getTopicChannels(props: GetTopicChannelsProps = {}) {
        return await this.#client.getTopicChannels({ ...props, ...this.#identity(props) })
    }

    async setTopic(props: SetTopicProps) {
        return await this.#client.setTopic({ ...props, ...this.#identity(props) })
    }

    async setTopics(props: SetTopicsProps) {
        return await this.#client.setTopics({ ...props, ...this.#identity(props) })
    }

    async subscribeTopic(props: ToggleTopicProps) {
        return await this.#client.subscribeTopic({ ...props, ...this.#identity(props) })
    }

    async unsubscribeTopic(props: ToggleTopicProps) {
        return await this.#client.unsubscribeTopic({ ...props, ...this.#identity(props) })
    }

    /** @deprecated Use {@link BrowserClient.getTopics}. Drops `kind` and `isOptIn`, and reports `not_opted_in` as `unsubscribed`. */
    async getSubscriptions(props: GetSubscriptionsProps = {}) {
        return await this.#client.getSubscriptions({ ...props, ...this.#identity(props) })
    }

    /** @deprecated Use {@link BrowserClient.setTopic}. */
    async setSubscription(props: SetSubscriptionProps) {
        return await this.#client.setSubscription({ ...props, ...this.#identity(props) })
    }

    #identity(props: Identity): Identity {
        return {
            anonymousId: props.anonymousId ?? this.#anonymousId,
            externalId: props.externalId ?? this.#externalId,
        }
    }

    uuid() {
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
            (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
        )
    }
}

export class Postles {
    static instance?: BrowserClient = undefined

    static initialize(props: ClientProps) {
        Postles.instance = new BrowserClient(props)
    }

    static async track(props: TrackProps) {
        return await Postles.instance?.track(props)
    }

    static async identify(props: IdentifyProps) {
        return await Postles.instance?.identify(props)
    }

    static async alias(props: BrowserAliasProps) {
        return await Postles.instance?.alias(props)
    }

    static async getTopics(props?: GetTopicsProps) {
        return await Postles.instance?.getTopics(props)
    }

    static async getTopicChannels(props?: GetTopicChannelsProps) {
        return await Postles.instance?.getTopicChannels(props)
    }

    static async setTopic(props: SetTopicProps) {
        return await Postles.instance?.setTopic(props)
    }

    static async setTopics(props: SetTopicsProps) {
        return await Postles.instance?.setTopics(props)
    }

    static async subscribeTopic(props: ToggleTopicProps) {
        return await Postles.instance?.subscribeTopic(props)
    }

    static async unsubscribeTopic(props: ToggleTopicProps) {
        return await Postles.instance?.unsubscribeTopic(props)
    }

    /** @deprecated Use {@link Postles.getTopics}. Drops `kind` and `isOptIn`, and reports `not_opted_in` as `unsubscribed`. */
    static async getSubscriptions(props?: GetSubscriptionsProps) {
        return await Postles.instance?.getSubscriptions(props)
    }

    /** @deprecated Use {@link Postles.setTopic}. */
    static async setSubscription(props: SetSubscriptionProps) {
        return await Postles.instance?.setSubscription(props)
    }
}


// If running in a browser, expose Postles from the window object
declare global {
    interface Window { Postles: any; }
}

if (typeof window !== 'undefined') {
    window.Postles = Postles
}
