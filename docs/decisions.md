# Decisions

## D-001: Keep the implementation separate

The two planning files were a handoff only. The product lives in this independent PocketForge folder and Git repository.

## D-002: Use Node 24 LTS

Node v24.13.0 is installed locally and Node 24 is listed as LTS by the official Node release schedule. The project pins the local runtime in .nvmrc and limits its engine range to Node 24.

## D-003: Pin the actual Meterless engine source

Meterless H-MEM upstream commit 1742dec56a66e58eef9dda2d2b865823758ca8cd is copied to vendor/meterless/hmem. This is a specification and deterministic reference implementation, not a production library. Preserve the Apache-2.0 license and provenance. The local skill library uses the pinned reference for provenance-aware memory, hybrid retrieval, and its trust ledger; deterministic contract checks still authorize execution. A production H-MEM engine remains outside the current demo evidence.

## D-004: Do not call paid providers without a budget

The NVIDIA adapter will use server-side credentials and enforce a configured session ceiling. Until a ceiling and key exist, the provider is disabled. Fixture work must be labeled and must not be described as live sponsor evidence.

## D-005: Do not invent Zetaris endpoints

The connector stays at an interface/fixture boundary until the tenant-specific auth, endpoint, pagination, and source details are verified.

## D-006: Keep the first local UI slice fixture-only

The current app demonstrates the end-to-end local workflow without pretending providers are configured. Synthetic fixture execution is labeled in the UI and evidence artifacts. Live Nemotron/Zetaris behavior stays blocked until credentials, budget, and the tenant API contract are available.

## D-007: Execute generated procedures through bounded IR

The export contains declarative skill instructions and a trusted interpreter. It does not execute arbitrary model-generated JavaScript or Python. Unsupported conditions return machine-readable reasons.

