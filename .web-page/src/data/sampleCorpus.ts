import { RepoInfo, SpecFile, GraphNode, GraphLink } from '../types';

export const SAMPLE_REPOS: RepoInfo[] = [
  {
    name: 'product-specs',
    path: '/Users/you/work/product-specs',
    specCount: 6,
    hasGraph: true,
    color: '#3b82f6', // Blue
    description: 'Core product features, requirements, PRDs, and user workflow specs.',
  },
  {
    name: 'platform-docs',
    path: '/Users/you/work/platform-docs',
    specCount: 5,
    hasGraph: true,
    color: '#10b981', // Emerald
    description: 'Backend architecture, auth services, API contracts, and infrastructure.',
  },
  {
    name: 'billing-service',
    path: '/Users/you/work/billing-service',
    specCount: 4,
    hasGraph: true,
    color: '#8b5cf6', // Violet
    description: 'Payment gateway integrations, invoice engines, and dispute handling.',
  },
  {
    name: 'team-os',
    path: '/Users/you/work/team-os',
    specCount: 3,
    hasGraph: false,
    color: '#f59e0b', // Amber
    description: 'Team processes, onboarding guides, and engineering standards.',
  },
];

export const SAMPLE_SPECS: SpecFile[] = [
  {
    id: 'product-specs:refund',
    repo: 'product-specs',
    path: 'payments/refund.md',
    title: 'Refund Flow & Policy',
    docType: 'prd',
    status: 'approved',
    tags: ['billing', 'payments', 'customer-support', 'spec:r-1.3', 'spec:tasks-012'],
    dependsOn: ['platform-docs:auth-api', 'billing-service:stripe-integration'],
    relationships: ['product-specs:chargeback', 'product-specs:invoice-spec'],
    linkedSpecs: ['billing-service:refund-engine'],
    lastModified: '2026-07-25',
    content: `---
id: capability://payments/refund
tags: billing, payments, customer-support
dependsOn: platform-docs:auth-api, billing-service:stripe-integration
relationships: product-specs:chargeback, product-specs:invoice-spec
---

# Refund Flow & Policy

When a customer requests a refund for a completed transaction, the system initiates the automated refund workflow.

## Requirements

- @spec R-1.3 — WHEN a customer submits a refund request within 30 days, THE SYSTEM SHALL process the refund to the original payment method.
- @spec TASKS-012 — WHEN a refund exceeds $500, THE SYSTEM SHALL require manager override approval.

## Workflow & Integrations

The refund service integrates directly with the [[Chargeback Doc]] and pairs with [[Stripe Integration Spec]] for webhook callbacks.

See also the architecture diagram in \`architecture/refund-diagram.png\`.
`,
  },
  {
    id: 'product-specs:chargeback',
    repo: 'product-specs',
    path: 'payments/chargeback.md',
    title: 'Chargeback & Dispute Management',
    docType: 'prd',
    status: 'draft',
    tags: ['billing', 'fraud', 'disputes', 'spec:r-1.4', 'link:chargeback-doc'],
    upstream: ['product-specs:refund'],
    relationships: ['billing-service:dispute-handler'],
    lastModified: '2026-07-20',
    content: `---
id: capability://payments/chargeback
tags: billing, fraud, disputes
upstream: product-specs:refund
---

# Chargeback & Dispute Management

Handles credit card chargebacks initiated by issuing banks.

## Requirements

- @spec R-1.4 — WHEN a payment processor sends a chargeback dispute notice, THE SYSTEM SHALL lock the customer account pending review.

## Overview

Pairs with [[Refund Flow & Policy]] to ensure double-refunding does not occur. Disputed amounts are held in escrow.
`,
  },
  {
    id: 'product-specs:signup',
    repo: 'product-specs',
    path: 'onboarding/signup-flow.md',
    title: 'User Signup & Verification',
    docType: 'prd',
    status: 'approved',
    tags: ['onboarding', 'auth', 'user-experience', 'spec:auth-001'],
    dependsOn: ['platform-docs:auth-api'],
    relationships: ['team-os:onboarding-guide'],
    lastModified: '2026-07-18',
    content: `---
id: capability://onboarding/signup
tags: onboarding, auth, user-experience
dependsOn: platform-docs:auth-api
---

# User Signup & Verification

Specifies multi-step account creation with magic link and OAuth 2.0 verification.

## Requirements

- @spec AUTH-001 — WHEN a user signs up with email, THE SYSTEM SHALL send a 6-digit verification pin expiring in 10 minutes.
`,
  },
  {
    id: 'product-specs:invoice-spec',
    repo: 'product-specs',
    path: 'payments/invoice.md',
    title: 'Automated Invoicing & Tax',
    docType: 'prd',
    status: 'approved',
    tags: ['billing', 'taxes', 'compliance', 'spec:tax-008'],
    relationships: ['billing-service:invoice-engine'],
    lastModified: '2026-07-22',
    content: `---
id: capability://payments/invoice
tags: billing, taxes, compliance
---

# Automated Invoicing & Tax Calculation

Generates compliant PDF invoices and calculates sales tax based on buyer location.

- @spec TAX-008 — THE SYSTEM SHALL calculate VAT for EU customers automatically.
`,
  },
  {
    id: 'platform-docs:auth-api',
    repo: 'platform-docs',
    path: 'services/auth-api.md',
    title: 'Auth API & JWT Token Service',
    docType: 'architecture',
    status: 'approved',
    tags: ['security', 'auth', 'jwt', 'spec:auth-002'],
    implementedBy: ['platform-docs:identity-service'],
    lastModified: '2026-07-24',
    content: `---
id: component://auth-api
tags: security, auth, jwt
---

# Auth API & JWT Token Service

Core authentication microservice issuing RS256 signed JWT tokens.

## Requirements

- @spec AUTH-002 — THE SYSTEM SHALL rotate JWT signing keys every 30 days without user session disruption.
`,
  },
  {
    id: 'platform-docs:identity-service',
    repo: 'platform-docs',
    path: 'services/identity.md',
    title: 'Identity & Access Management (IAM)',
    docType: 'architecture',
    status: 'approved',
    tags: ['security', 'iam', 'rbac', 'spec:auth-003'],
    relationships: ['platform-docs:auth-api'],
    lastModified: '2026-07-15',
    content: `---
id: component://identity-service
tags: security, iam, rbac
---

# IAM & Role-Based Access Control

Role and permission evaluation engine enforcing granular scopes.

- @spec AUTH-003 — THE SYSTEM SHALL evaluate RBAC policies in under 5 milliseconds per request.
`,
  },
  {
    id: 'platform-docs:event-bus',
    repo: 'platform-docs',
    path: 'infrastructure/event-bus.md',
    title: 'Event Bus & Messaging Backbone',
    docType: 'architecture',
    status: 'approved',
    tags: ['infrastructure', 'events', 'kafka'],
    relationships: ['billing-service:stripe-integration'],
    lastModified: '2026-07-10',
    content: `---
id: component://event-bus
tags: infrastructure, events, kafka
---

# Event Bus Architecture

Distributed pub/sub messaging system for asynchronous domain events.
`,
  },
  {
    id: 'billing-service:stripe-integration',
    repo: 'billing-service',
    path: 'integrations/stripe.md',
    title: 'Stripe Integration Spec',
    docType: 'api',
    status: 'approved',
    tags: ['billing', 'stripe', 'webhooks', 'spec:r-1.3', 'link:stripe-integration-spec'],
    relationships: ['billing-service:refund-engine'],
    lastModified: '2026-07-26',
    content: `---
id: component://stripe-integration
tags: billing, stripe, webhooks
---

# Stripe Integration Spec

Handles payment intents, webhook verification, and refund payouts.

## Requirements

- @spec R-1.3 — Pairs with [[Refund Flow & Policy]] to execute idempotency checks on refund charges.
`,
  },
  {
    id: 'billing-service:refund-engine',
    repo: 'billing-service',
    path: 'engine/refund-processor.md',
    title: 'Refund Processing Engine',
    docType: 'api',
    status: 'approved',
    tags: ['billing', 'payouts', 'ledger'],
    relationships: ['billing-service:stripe-integration'],
    lastModified: '2026-07-23',
    content: `---
id: component://refund-engine
tags: billing, payouts, ledger
---

# Refund Processing Engine

Backend worker executing ledger adjustments and reversal payouts.
`,
  },
  {
    id: 'billing-service:refund-diagram',
    repo: 'billing-service',
    path: 'architecture/refund-diagram.png',
    title: 'Refund Sequence Diagram (Image Sidecar)',
    docType: 'media',
    status: 'approved',
    tags: ['diagram', 'billing', 'sidecar', 'spec:r-1.3'],
    isMediaSidecar: true,
    mediaFile: 'architecture/refund-diagram.png',
    lastModified: '2026-07-25',
    content: `---
title: Refund Sequence Diagram
tags: diagram, billing, sidecar
---

# Refund Sequence Diagram

Sidecar description for refund-diagram.png:
Illustrates the 4-way handshake between Support Portal UI, Express API Gateway, Stripe Webhook, and General Ledger.
`,
  },
  {
    id: 'team-os:onboarding-guide',
    repo: 'team-os',
    path: 'guides/engineering-onboarding.md',
    title: 'Engineering Onboarding & Local Search setup',
    docType: 'guide',
    status: 'approved',
    tags: ['onboarding', 'developer-experience', 'tools'],
    relationships: ['product-specs:signup'],
    lastModified: '2026-07-12',
    content: `---
id: guide://engineering-onboarding
tags: onboarding, developer-experience, tools
---

# Engineering Onboarding Guide

Welcome! This guide explains how to set up local search, checkout repositories, and configure scope.
`,
  },
];

export const SAMPLE_GRAPH_NODES: GraphNode[] = [
  // Docs / Gold Nodes
  {
    id: 'GOLDEN-PATH',
    name: 'GOLDEN-PATH',
    title: 'Golden Path: from an empty directory to a completed change',
    repo: 'uncle-os',
    path: 'company-os-starter/docs/GOLDEN-PATH.md',
    docType: 'doc',
    osLayer: 'Docs',
    tags: ['doc/company-os-starter', 'kind/golden-path'],
    status: 'approved',
    relevanceScore: 0.98,
    x: 280,
    y: 190,
  },
  {
    id: 'TUTORIAL',
    name: 'TUTORIAL',
    title: 'Company OS Getting Started Tutorial',
    repo: 'uncle-os',
    path: 'company-os-starter/docs/TUTORIAL.md',
    docType: 'doc',
    osLayer: 'Docs',
    tags: ['doc/tutorial', 'getting-started'],
    status: 'approved',
    relevanceScore: 0.92,
    x: 180,
    y: 210,
  },
  {
    id: '01-first-day-with-company-os',
    name: '01-first-day-with-company-os',
    title: '01 First Day Setup & Workspace Guide',
    repo: 'uncle-os',
    path: 'company-os-starter/docs/01-first-day.md',
    docType: 'doc',
    osLayer: 'Docs',
    tags: ['doc/onboarding', 'day-one'],
    status: 'approved',
    relevanceScore: 0.89,
    x: 320,
    y: 320,
  },
  {
    id: 'doc://api-conventions',
    name: 'doc://api-conventions',
    title: 'REST & gRPC API Design Standards',
    repo: 'platform-docs',
    path: 'docs/api-conventions.md',
    docType: 'doc',
    osLayer: 'Docs',
    tags: ['api', 'standards'],
    status: 'approved',
    relevanceScore: 0.82,
    x: 260,
    y: 110,
  },
  {
    id: 'doc://deploy-checklist',
    name: 'doc://deploy-checklist',
    title: 'Production Deployment & Rollback Checklist',
    repo: 'platform-docs',
    path: 'docs/deploy-checklist.md',
    docType: 'doc',
    osLayer: 'Docs',
    tags: ['devops', 'release'],
    status: 'approved',
    relevanceScore: 0.85,
    x: 350,
    y: 120,
  },

  // Ontology / Purple Nodes
  {
    id: 'product-specs:capability://payments/refund',
    name: 'capability://payments/refund',
    title: 'Refund Flow & Policy',
    repo: 'product-specs',
    path: 'payments/refund.md',
    docType: 'prd',
    osLayer: 'Ontology',
    tags: ['billing', 'payments', 'spec:r-1.3'],
    status: 'approved',
    relevanceScore: 0.95,
    x: 160,
    y: 110,
  },
  {
    id: 'product-specs:capability://payments/chargeback',
    name: 'capability://payments/chargeback',
    title: 'Chargeback & Dispute Management',
    repo: 'product-specs',
    path: 'payments/chargeback.md',
    docType: 'prd',
    osLayer: 'Ontology',
    tags: ['billing', 'disputes', 'spec:r-1.4'],
    status: 'draft',
    relevanceScore: 0.82,
    x: 100,
    y: 140,
  },
  {
    id: 'product-specs:capability://onboarding/signup',
    name: 'capability://onboarding/signup',
    title: 'User Signup & Verification',
    repo: 'product-specs',
    path: 'onboarding/signup-flow.md',
    docType: 'prd',
    osLayer: 'Ontology',
    tags: ['onboarding', 'auth'],
    status: 'approved',
    relevanceScore: 0.78,
    x: 130,
    y: 280,
  },
  {
    id: 'product-specs:capability://billing/subscriptions',
    name: 'capability://billing/subscriptions',
    title: 'Recurring Subscription Billing',
    repo: 'product-specs',
    path: 'payments/subscriptions.md',
    docType: 'prd',
    osLayer: 'Ontology',
    tags: ['billing', 'saas'],
    status: 'approved',
    relevanceScore: 0.84,
    x: 210,
    y: 150,
  },

  // Platform / Teal Nodes
  {
    id: 'platform-docs:component://auth-api',
    name: 'component://auth-api',
    title: 'Auth API & JWT Token Service',
    repo: 'platform-docs',
    path: 'services/auth-api.md',
    docType: 'architecture',
    osLayer: 'Platform',
    tags: ['security', 'auth', 'jwt'],
    status: 'approved',
    relevanceScore: 0.88,
    x: 230,
    y: 250,
  },
  {
    id: 'platform-docs:component://identity-service',
    name: 'component://identity-service',
    title: 'IAM & Access Control',
    repo: 'platform-docs',
    path: 'services/identity.md',
    docType: 'architecture',
    osLayer: 'Platform',
    tags: ['security', 'iam'],
    status: 'approved',
    relevanceScore: 0.72,
    x: 150,
    y: 330,
  },
  {
    id: 'billing-service:component://stripe-integration',
    name: 'component://stripe-integration',
    title: 'Stripe Integration Spec',
    repo: 'billing-service',
    path: 'integrations/stripe.md',
    docType: 'api',
    osLayer: 'Platform',
    tags: ['billing', 'stripe'],
    status: 'approved',
    relevanceScore: 0.91,
    x: 290,
    y: 250,
  },
  {
    id: 'billing-service:component://refund-engine',
    name: 'component://refund-engine',
    title: 'Refund Processing Engine',
    repo: 'billing-service',
    path: 'engine/refund-processor.md',
    docType: 'api',
    osLayer: 'Platform',
    tags: ['billing', 'payouts'],
    status: 'approved',
    relevanceScore: 0.85,
    x: 380,
    y: 230,
  },
  {
    id: 'platform-docs:component://event-bus',
    name: 'component://event-bus',
    title: 'Kafka Messaging Event Bus',
    repo: 'platform-docs',
    path: 'infrastructure/event-bus.md',
    docType: 'architecture',
    osLayer: 'Platform',
    tags: ['infrastructure', 'kafka'],
    status: 'approved',
    relevanceScore: 0.79,
    x: 410,
    y: 170,
  },

  // Team / Orange Nodes
  {
    id: 'team-os:guide://engineering-onboarding',
    name: 'guide://engineering-onboarding',
    title: 'Engineering Onboarding Guide',
    repo: 'team-os',
    path: 'guides/engineering-onboarding.md',
    docType: 'guide',
    osLayer: 'Team',
    tags: ['onboarding'],
    status: 'approved',
    relevanceScore: 0.65,
    x: 80,
    y: 220,
  },
  {
    id: 'team-os:team://security-guild',
    name: 'team://security-guild',
    title: 'Security Review & Compliance Guild',
    repo: 'team-os',
    path: 'teams/security-guild.md',
    docType: 'team',
    osLayer: 'Team',
    tags: ['security', 'compliance'],
    status: 'approved',
    relevanceScore: 0.6,
    x: 70,
    y: 310,
  },

  // Other / Slate Nodes (Including Unresolved Links)
  {
    id: 'product-specs:component://legacy-audit-log',
    name: 'component://legacy-audit-log',
    title: 'Unresolved Audit Log Worker',
    repo: 'product-specs',
    path: 'payments/refund.md',
    docType: 'unresolved',
    osLayer: 'Other',
    tags: ['unresolved'],
    flags: ['unresolved'],
    relevanceScore: 0.3,
    x: 390,
    y: 70,
  },
  {
    id: 'billing-service:unresolved-tax-calculator',
    name: 'component://tax-calc-v1',
    title: 'Unresolved Tax Engine v1',
    repo: 'billing-service',
    path: 'payments/invoice.md',
    docType: 'unresolved',
    osLayer: 'Other',
    tags: ['unresolved'],
    flags: ['unresolved'],
    relevanceScore: 0.25,
    x: 420,
    y: 280,
  },
];

export const SAMPLE_GRAPH_LINKS: GraphLink[] = [
  // Golden Path connections matching screenshot!
  {
    source: 'GOLDEN-PATH',
    target: '01-first-day-with-company-os',
    weight: 0.95,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },
  {
    source: 'GOLDEN-PATH',
    target: 'TUTORIAL',
    weight: 0.95,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },
  {
    source: 'TUTORIAL',
    target: 'GOLDEN-PATH',
    weight: 0.9,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },
  {
    source: 'TUTORIAL',
    target: '01-first-day-with-company-os',
    weight: 0.85,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },
  {
    source: 'GOLDEN-PATH',
    target: 'doc://api-conventions',
    weight: 0.8,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },
  {
    source: 'doc://deploy-checklist',
    target: 'GOLDEN-PATH',
    weight: 0.85,
    family: 'declared',
    relation: 'links_to',
    confidence: 1.0,
  },

  // Ontology & Platform Declared Links
  {
    source: 'product-specs:capability://payments/refund',
    target: 'platform-docs:component://auth-api',
    weight: 0.9,
    family: 'declared',
    relation: 'depends_on',
    confidence: 1.0,
  },
  {
    source: 'product-specs:capability://payments/refund',
    target: 'billing-service:component://stripe-integration',
    weight: 0.95,
    family: 'declared',
    relation: 'depends_on',
    confidence: 1.0,
  },
  {
    source: 'product-specs:capability://payments/refund',
    target: 'product-specs:capability://payments/chargeback',
    weight: 0.85,
    family: 'declared',
    relation: 'related_to',
    confidence: 1.0,
  },
  {
    source: 'product-specs:capability://payments/refund',
    target: 'product-specs:capability://billing/subscriptions',
    weight: 0.8,
    family: 'declared',
    relation: 'related_to',
    confidence: 1.0,
  },
  {
    source: 'billing-service:component://stripe-integration',
    target: 'billing-service:component://refund-engine',
    weight: 0.92,
    family: 'declared',
    relation: 'related_to',
    confidence: 1.0,
  },
  {
    source: 'billing-service:component://refund-engine',
    target: 'platform-docs:component://event-bus',
    weight: 0.88,
    family: 'declared',
    relation: 'publishes_to',
    confidence: 1.0,
  },
  {
    source: 'product-specs:capability://onboarding/signup',
    target: 'platform-docs:component://auth-api',
    weight: 0.88,
    family: 'declared',
    relation: 'depends_on',
    confidence: 1.0,
  },
  {
    source: 'platform-docs:component://identity-service',
    target: 'platform-docs:component://auth-api',
    weight: 0.75,
    family: 'declared',
    relation: 'related_to',
    confidence: 1.0,
  },
  {
    source: 'team-os:guide://engineering-onboarding',
    target: 'TUTORIAL',
    weight: 0.8,
    family: 'declared',
    relation: 'references',
    confidence: 1.0,
  },
  {
    source: 'team-os:team://security-guild',
    target: 'platform-docs:component://identity-service',
    weight: 0.85,
    family: 'declared',
    relation: 'reviews',
    confidence: 1.0,
  },

  // Unresolved Links (Dashed Amber)
  {
    source: 'product-specs:capability://payments/refund',
    target: 'product-specs:component://legacy-audit-log',
    weight: 0.6,
    family: 'unresolved',
    relation: 'depends_on',
    confidence: 1.0,
  },
  {
    source: 'billing-service:component://refund-engine',
    target: 'billing-service:unresolved-tax-calculator',
    weight: 0.6,
    family: 'unresolved',
    relation: 'calls',
    confidence: 1.0,
  },
  {
    source: 'GOLDEN-PATH',
    target: 'product-specs:component://legacy-audit-log',
    weight: 0.55,
    family: 'unresolved',
    relation: 'unresolved_link',
    confidence: 1.0,
  },

  // Similarity Links (Faint Gray)
  {
    source: 'product-specs:capability://payments/refund',
    target: 'platform-docs:component://identity-service',
    weight: 0.38,
    family: 'similarity',
    confidence: 0.38,
  },
  {
    source: 'product-specs:capability://payments/chargeback',
    target: 'platform-docs:component://auth-api',
    weight: 0.32,
    family: 'similarity',
    confidence: 0.32,
  },
  {
    source: 'GOLDEN-PATH',
    target: 'platform-docs:component://event-bus',
    weight: 0.41,
    family: 'similarity',
    confidence: 0.41,
  },
];
