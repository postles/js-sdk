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

export class Client {
    #apiKey: string
    #urlEndpoint: string

    constructor(props: ClientProps) {
        this.#apiKey = props.apiKey
        this.#urlEndpoint = props.urlEndpoint
    }

    async track({ event, properties, anonymousId, externalId }: TrackProps) {
        return await this.#request('events', [{
            name: event,
            anonymous_id: anonymousId,
            external_id: externalId,
            data: properties,
        }])
    }

    async identify({ traits, anonymousId, externalId, phone, email, timezone, locale }: IdentifyProps) {
        return await this.#request('identify', {
            anonymous_id: anonymousId,
            external_id: externalId,
            phone,
            email,
            timezone,
            locale,
            data: traits,
        })
    }

    async alias({ anonymousId, externalId }: AliasProps) {
        return await this.#request('alias', {
            anonymous_id: anonymousId,
            external_id: externalId,
        })
    }

    async #request(path: string, body: unknown) {
        const response = await fetch(`${this.#urlEndpoint}/client/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.#apiKey}`,
            },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            const text = await response.text()
            throw new Error(`Postles /client/${path} failed (${response.status}): ${text}`)
        }
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
}


// If running in a browser, expose Postles from the window object
declare global {
    interface Window { Postles: any; }
}

if (typeof window !== 'undefined') {
    window.Postles = Postles
}
