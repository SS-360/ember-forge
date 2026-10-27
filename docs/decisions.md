# Decisions

## D-001: Keep the implementation separate

The two planning files were a handoff only. The product lives in this independent EmberForge folder and Git repository.

## D-002: Use Node 24 LTS

Node v24.13.0 is installed locally and Node 24 is listed as LTS by the official Node release schedule. The project pins the local runtime in .nvmrc and limits its engine range to Node 24.

## D-003: Pin the actual Meterless engine source

Meterless H-MEM upstream commit 1742dec56a66e58eef9dda2d2b865823758ca8cd is copied to vendor/meterless/hmem. Preserve the Apache-2.0 license and provenance. The local Skill Library uses the pinned engine in a working feature for provenance-aware retrieval, verified-skill reuse, and policy/schema invalidation. Product integration and upstream conformance evidence are recorded in [readiness](readiness.md) and [release readiness](release-readiness.md); the feature is a prototype implementation, not a production deployment.

## D-004: Do not call paid providers without a budget

The NVIDIA adapter will use server-side credentials and enforce a configured session ceiling. Until a ceiling and key exist, the provider is disabled. Fixture work must be labeled and must not be described as live sponsor evidence.

## D-005: Do not invent Zetaris endpoints

The connector stays at an interface/fixture boundary until the tenant-specific auth, endpoint, pagination, and source details are verified.

## D-006: Keep the first local UI slice fixture-only

The current app demonstrates the end-to-end local workflow without pretending providers are configured. Synthetic fixture execution is labeled in the UI and evidence artifacts. Live Nemotron/Zetaris behavior stays blocked until credentials, budget, and the tenant API contract are available.

## D-007: Execute generated procedures through bounded IR

The export contains declarative skill instructions and a trusted interpreter. It does not execute arbitrary model-generated JavaScript or Python. Unsupported conditions return machine-readable reasons.

## Current status amendments — 27 October 2026

Later user-authorized work superseded the setup checkpoints in D-004 and D-006: Nemotron original-agent calls and synthesis ran under a free-endpoint $0 ceiling; local Zetaris stock reads, a cross-source join and freshness check ran on synthetic sources; H-MEM is in the actual library path. See [integration evidence](integrations.md). D-005 remains in force for tenant-specific SaaS routes: use the local deployment's documented JDBC contract where already verified, and do not invent a remote endpoint.

The supplied guide describes Meterless Nightshift as a primary-provider direction. It is not integrated and remains separate from H-MEM's Meterless Engine criterion. The full official rules were not included in the supplied capture, so mandatory status is unverified. The local Zetaris path now feeds receipt-bound snapshots into the original-agent workflow; see the [hackathon resource audit](hackathon-resource-audit.md).

