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

type SubscriptionState = 'subscribed' | 'unsubscribed'

type SubscriptionPreference = {
    subscriptionId: number
    name: string
    channel: string
    state: SubscriptionState
}

type SubscriptionPage = {
    results: SubscriptionPreference[]
    nextCursor?: string
    prevCursor?: string
    limit: number
}

type GetSubscriptionsProps = {
    anonymousId?: string
    externalId?: string
    cursor?: string
    limit?: number
}

type SetSubscriptionProps = {
    subscriptionId: number
    state: SubscriptionState
    anonymousId?: string
    externalId?: string
}

type RequestOptions = {
    method?: string
    body?: unknown
    query?: Record<string, string | number | undefined>
    headers?: Record<string, string | undefined>
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

    /**
     * Fetch the current user's subscription preferences.
     *
     * Only public subscriptions are returned. The user is identified by the
     * anonymousId / externalId you pass in. Use the returned `nextCursor` to
     * page through results.
     */
    async getSubscriptions({ anonymousId, externalId, cursor, limit }: GetSubscriptionsProps = {}): Promise<SubscriptionPage> {
        const page = await this.#request('subscriptions', {
            method: 'GET',
            query: { cursor, limit },
            headers: {
                'x-anonymous-id': anonymousId,
                'x-external-id': externalId,
            },
        })
        return {
            results: (page?.results ?? []).map((item: any) => ({
                subscriptionId: item.subscription_id,
                name: item.name,
                channel: item.channel,
                state: item.state,
            })),
            nextCursor: page?.nextCursor,
            prevCursor: page?.prevCursor,
            limit: page?.limit,
        }
    }

    /**
     * Update a single subscription preference for the current user.
     *
     * Flips one public subscription between `subscribed` and `unsubscribed`.
     */
    async setSubscription({ subscriptionId, state, anonymousId, externalId }: SetSubscriptionProps) {
        return await this.#request(`subscriptions/${subscriptionId}`, {
            method: 'PUT',
            body: {
                anonymous_id: anonymousId,
                external_id: externalId,
                state,
            },
        })
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
        if (!response.ok) {
            const text = await response.text()
            throw new Error(`Postles /client/${path} failed (${response.status}): ${text}`)
        }
        const text = await response.text()
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

    async getSubscriptions(props: GetSubscriptionsProps = {}) {
        return await this.#client.getSubscriptions({
            ...props,
            anonymousId: props.anonymousId ?? this.#anonymousId,
            externalId: props.externalId ?? this.#externalId,
        })
    }

    async setSubscription(props: SetSubscriptionProps) {
        return await this.#client.setSubscription({
            ...props,
            anonymousId: props.anonymousId ?? this.#anonymousId,
            externalId: props.externalId ?? this.#externalId,
        })
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

    static async getSubscriptions(props?: GetSubscriptionsProps) {
        return await Postles.instance?.getSubscriptions(props)
    }

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
