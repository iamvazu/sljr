'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const db = require('../site/db/database');
const geoip = require('../site/lib/geoip');
const groqAgent = require('../site/lib/groq-agent');

test('Chat Sessions & GeoIP Module Tests', async (t) => {
  await t.test('GeoIP resolves local/private IPs safely without network crash', async () => {
    const local = await geoip.lookupIp('127.0.0.1');
    assert.equal(local.city, 'San Francisco Bay Area');
    assert.equal(local.region, 'CA');
    assert.equal(geoip.isPrivateIp('192.168.1.10'), true);
    assert.equal(geoip.isPrivateIp('8.8.8.8'), false);
  });

  await t.test('Database correctly creates and retrieves chat sessions and messages', () => {
    const testSessionId = 'test-session-' + Date.now();
    const session = db.upsertChatSession({
      sessionId: testSessionId,
      ip: '127.0.0.1',
      city: 'Pleasanton',
      region: 'CA',
      country: 'USA',
      device: 'mobile',
      page_url: '/areas/pleasanton.html',
      utm_source: 'google',
      utm_campaign: 'luxury_homes',
      last_message: 'Tell me about homes in Ruby Hill'
    });

    assert.ok(session);
    assert.equal(session.session_id, testSessionId);
    assert.equal(session.city, 'Pleasanton');
    assert.equal(session.device, 'mobile');

    // Insert user and assistant messages
    db.insertChatMessage({
      sessionId: testSessionId,
      role: 'user',
      content: 'Tell me about homes in Ruby Hill'
    });
    db.insertChatMessage({
      sessionId: testSessionId,
      role: 'assistant',
      content: 'Ruby Hill is an exclusive gated community in Pleasanton with a Jack Nicklaus signature golf course.',
      intent: 'PROPERTY_INQUIRY',
      properties: [{ address: '1100 Ruby Hill Blvd', city: 'Pleasanton', price: 4200000 }]
    });

    // Retrieve transcript
    const messages = db.getChatMessages(testSessionId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[1].role, 'assistant');
    assert.ok(messages[1].properties);
    assert.equal(messages[1].properties[0].city, 'Pleasanton');

    // Retrieve session list for admin panel
    const list = db.getChatSessions({ limit: 10, offset: 0, search: 'Pleasanton' });
    assert.ok(list.sessions.length >= 1);
    const found = list.sessions.find((s) => s.session_id === testSessionId);
    assert.ok(found);
    assert.equal(found.city, 'Pleasanton');
  });

  await t.test('Fair housing guardrail strictly enforces crime/safety refusal', async () => {
    const fairHousingQuery = 'Is Danville a safe neighborhood with low crime?';
    const response = await groqAgent.generateResponse(fairHousingQuery);
    assert.ok(response.reply.includes('Fair Housing regulations') || response.reply.includes('police'));
    assert.equal(response.intent, 'SAFETY_ADVISORY');
  });
});
