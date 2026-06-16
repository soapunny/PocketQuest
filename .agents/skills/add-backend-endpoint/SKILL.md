# .agents/skills/add-backend-endpoint/SKILL.md

---
description: Use this when adding or restructuring a backend API endpoint in apps/server that may touch shared contracts, service logic, repositories, or Prisma-backed persistence.
autoApply: false
---

# Add Backend Endpoint

## Goal
Add or revise a backend endpoint with consistent layering and shared-contract discipline.

## Use This Skill When
- adding a new endpoint
- splitting route logic into service/repository/mapper
- introducing new request/response shapes
- exposing existing backend behavior through a cleaner endpoint

## Workflow

### 1. Inspect first
Read the nearest existing route, service, repository, mapper, and shared contract files before editing.

### 2. Define the contract
- Check `packages/shared` first for an existing DTO/schema.
- Reuse existing request/response contracts when possible.
- If the contract is cross-layer, add/update it in shared before wiring the endpoint.

### 3. Keep route thin
In the route/handler:
- parse request
- authenticate/authorize
- validate input
- call service
- return response

Do not bury business logic or Prisma queries in the route.

### 4. Put business logic in service
In the service:
- enforce invariants
- coordinate repository calls
- handle workflow branching
- decide domain behavior

### 5. Put persistence in repository
In the repository:
- perform Prisma/database access
- keep methods query-focused
- avoid HTTP or response formatting concerns

### 6. Map output intentionally
- use mapper logic when converting DB/domain shapes into DTOs
- do not return unstable raw persistence shapes if a stable contract should exist

### 7. Verify alignment
Check all affected pieces:
- shared contract
- route validation
- service assumptions
- repository fields/relations
- Prisma schema assumptions

## Done Criteria
- endpoint follows route → service → repository separation
- cross-layer contract lives in shared when appropriate
- no duplicate DTO/type definitions were introduced
- persistence assumptions match Prisma schema
- touched files are limited to relevant scope