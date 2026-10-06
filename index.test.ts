import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client, PostlesError, TOPIC_RESUBSCRIBE_LOCKED } from './index'

const client = new Client({ apiKey: 'test-key', urlEndpoint: 'https://example.test/api' })

const respondWith = (status: number, body?: unknown) => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body === undefined ? '' : JSON.stringify(body),
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('getTopicChannels', () => {
    it('maps a channel group with its master, topics and START notice', async () => {
        respondWith(200, {
            channels: [
                {
                    channel: 'text',
                    label: 'All Text Messages',
                    master: { subscription_id: 1, name: 'All Text Messages', channel: 'text', kind: 'channel', is_opt_in: false, state: 'unsubscribed' },
                    topics: [{ subscription_id: 11, name: 'Daily Recap', channel: 'text', kind: 'topic', is_opt_in: true, state: 'not_opted_in' }],
                    paused: true,
                    can_resubscribe: false,
                    resubscribe_text_number: '+1 312 555 0100',
                },
            ],
        })

        expect(await client.getTopicChannels({ externalId: 'user-1' })).toEqual([
            {
                channel: 'text',
                label: 'All Text Messages',
                master: { subscriptionId: 1, name: 'All Text Messages', channel: 'text', kind: 'channel', isOptIn: false, state: 'unsubscribed' },
                topics: [{ subscriptionId: 11, name: 'Daily Recap', channel: 'text', kind: 'topic', isOptIn: true, state: 'not_opted_in' }],
                paused: true,
                canResubscribe: false,
                resubscribeTextNumber: '+1 312 555 0100',
            },
        ])
    })
})

describe('getTopics', () => {
    it('defaults kind and isOptIn on a row from an older backend', async () => {
        respondWith(200, {
            results: [{ subscription_id: 20, name: 'Newsletter', channel: 'email', state: 'subscribed' }],
            limit: 25,
        })

        const page = await client.getTopics({ externalId: 'user-1' })

        expect(page.results).toEqual([
            { subscriptionId: 20, name: 'Newsletter', channel: 'email', kind: 'topic', isOptIn: false, state: 'subscribed' },
        ])
    })
})

describe('getSubscriptions', () => {
    it('reports not_opted_in as unsubscribed for legacy callers', async () => {
        respondWith(200, {
            results: [
                { subscription_id: 11, name: 'Daily Recap', channel: 'text', kind: 'topic', is_opt_in: true, state: 'not_opted_in' },
                { subscription_id: 20, name: 'Newsletter', channel: 'email', kind: 'topic', is_opt_in: false, state: 'subscribed' },
            ],
            limit: 25,
        })

        const page = await client.getSubscriptions({ externalId: 'user-1' })

        expect(page.results).toEqual([
            { subscriptionId: 11, name: 'Daily Recap', channel: 'text', state: 'unsubscribed' },
            { subscriptionId: 20, name: 'Newsletter', channel: 'email', state: 'subscribed' },
        ])
    })
})

describe('setTopics', () => {
    it('throws a typed error when a channel can only be turned back on from the handset', async () => {
        const fetchMock = respondWith(422, {
            status: 'error',
            error: 'Text messages can only be turned back on by replying START from your phone.',
            code: 4004,
        })

        const save = client.setTopics({
            updates: [{ subscriptionId: 1, state: 'subscribed' }],
            externalId: 'user-1',
        })

        await expect(save).rejects.toBeInstanceOf(PostlesError)
        await expect(save).rejects.toMatchObject({
            status: 422,
            code: TOPIC_RESUBSCRIBE_LOCKED,
            message: 'Text messages can only be turned back on by replying START from your phone.',
        })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://example.test/api/client/subscriptions')
        expect(init.method).toBe('PUT')
        expect(init.headers['x-external-id']).toBe('user-1')
        expect(JSON.parse(init.body)).toEqual([{ subscription_id: 1, state: 'subscribed' }])
    })
})
