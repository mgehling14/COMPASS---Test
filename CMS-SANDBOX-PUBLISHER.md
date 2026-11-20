# CMS Sandbox shared publisher

This publisher is limited to `mgehling14/COMPASS---Test`, branch `main`, and CMS Sandbox app `77b2c86e-31b0-4dcf-a2e0-b4efd9d8ad26`. It never targets the live app or a live repository. Environment: `Default-0528c75b-bb2a-4718-b02a-1902cc340b62`; Dataverse URL: `https://org1f466e4e.crm.dynamics.com/`.

## Setup status

The workflow and controller are prepared for review. Deployment is disabled unless repository variable `COMPASS_SANDBOX_PUBLISHER_ENABLED` is exactly `true`, the dedicated credentials exist, the requested checkpoints are in current main, and all validation succeeds. Preparing these files does not establish a working publisher. See the setup steps below before activation.

On November 20, 2026, baseline main `629511ac843f1cfbeb408eb02d025adcecc00951` built successfully, but lint reported four existing parser errors in `src/generated/services/MicrosoftDataverseService.ts` and `.packages/client-experience-20261019/baseline/src/generated/services/MicrosoftDataverseService.ts`, near line 496. No exception was accepted. The publisher deliberately blocks on these errors; it does not suppress or waive them. The pre-existing application regression run also had 1,337 passes and four failures out of 1,341 tests: program-choice/ID layout, Glendale release, SASP routing, and search-workspace wiring. Two failures reference a missing separate live checkout; no live checkout was created or changed to satisfy them. These failures also need resolution or a separately agreed treatment before deployment can pass.

A dedicated Entra app registration and enterprise service principal exist:

| Identifier | Value |
| --- | --- |
| Display name | COMPASS CMS Sandbox Publisher |
| Tenant | `0528c75b-bb2a-4718-b02a-1902cc340b62` |
| Application/client ID | `73bc2627-cca1-4fb3-ae3c-7a09dc83b202` |
| App registration object ID | `6273ecb6-2a31-40cc-99bf-acfcb1b02c71` |
| Enterprise service principal object ID | `27861089-b725-403f-814b-c8fcbd9b64ad` |

No client secret, environment role, or successful app edit grant was created during setup. CLI `pa app share` 1.4.2 rejected the valid default-environment name with “Environment name must be a GUID when modifying app permissions.” This happened before a successful grant. Do not strip `Default-`, substitute another environment, or grant tenant-wide management privileges to bypass it. An app maker/admin must resolve this with a supported sharing path or a corrected CLI. Environment access and app edit access are separate prerequisites.

## How the shared queue works

[The workflow](.github/workflows/cms-sandbox-publisher.yml) runs only on explicit `workflow_dispatch`. Source pushes alone do not deploy. All runs use the fixed app-wide concurrency group `compass-cms-sandbox-deploy` with `cancel-in-progress: false`. The lock includes selection, validation/build, upload, and post-upload verification. Pending requests may coalesce into a newer pending request; each selected build includes combined main, rather than treating every pending request as a separately guaranteed upload.

After acquiring the queue, the controller fetches and selects latest observed main in a clean runner checkout. It verifies the required checkpoint's ancestry, repository, branch context, fixed app/environment/build settings, and source cleanliness. It installs from the lockfile, builds, lints, and runs regression/controller tests. If main changes before upload, it selects and validates the newer tree again. Sustained pre-upload churn fails safely rather than uploading stale code.

Upload uses separately pinned `@microsoft/power-apps-cli@1.4.2` and explicit service-principal mode. Credentials are not passed to install/build/lint/test child processes. No cached developer login is used by CI. A missing credential or failure stops the run. The workflow performs no app sharing, role assignment, backend/table changes or configuration repointing.

After a successful upload, the controller fetches again. If main advanced, the receipt reports the app behind and requests another run through the same queue. Reconciliation is bounded; an exhausted limit or enqueue failure remains a reported failure, requiring a new deployment request. It never silently declares the app latest. Do not cancel an in-flight upload. GitHub app publishing success does not prove every browser reloaded or that runtime user workflows passed.

Concurrent testing is allowed. Every app writer must use this publisher for the queue to provide serialization. GitHub cannot stop someone who retains app edit rights from publishing outside it; the team must stop direct laptop PAC/PA pushes. This setup does not revoke anyone's rights or change live access. A second repository/workflow using a separate queue is not the same lock.

## Mason's activation steps

1. Review and merge the scoped publisher change through the repository's normal rules. Fix the existing lint and regression errors or explicitly agree a narrowly specified baseline treatment in a separate change. Do not silently bypass checks. Run the publisher tests and `npm run build`, `npm run lint`, and regression tests on the combined main.
2. Ensure the dedicated enterprise service principal has required access to the named environment and edit access only to CMS Sandbox. Do not grant access to the live app or broad backend/tenant roles. Microsoft documents the maker-side command below, but installed CLI 1.4.2 currently rejects this default-environment name. Resolve that compatibility issue before running an alternative; this is not an instruction to change configuration.

   ```sh
   pa app share --principal 27861089-b725-403f-814b-c8fcbd9b64ad --access edit
   ```

3. Once supported access is verified, create a short-lived credential for this dedicated registration using the approved tenant process. Store it directly as repository Actions secret `COMPASS_SANDBOX_CLIENT_SECRET`; store the approved client ID as `COMPASS_SANDBOX_CLIENT_ID`. Do not paste secrets into chat, commits, command arguments, receipts or screenshots. Record expiry/rotation ownership securely. The workflow hardcodes the tenant and accepts only this client ID.
4. Confirm GitHub Actions is allowed to run this workflow and its pinned actions. Run **Verify** on main first. It does not need cloud credentials and never uploads. Confirm all checks and the receipt, including Sandbox target and selected SHA.
5. Confirm Brian, Mason, and Michaela can dispatch this same workflow through their GitHub write access. Agree that nobody will use direct laptop publishing or another queue. Keep the workflow dispatch on `main`; other refs/repositories are rejected.
6. Set repository Actions variable `COMPASS_SANDBOX_PUBLISHER_ENABLED=true` only after the prerequisites above are complete. Setting it is not itself deployment verification. Request **Deploy** through the workflow, inspect upload success and the receipt, check post-upload main status, and verify the app in the browser. Confirm expected permissions/connections operate without backend changes.
7. Test overlapping deployment requests through the same workflow: only one upload may run; pending requests coalesce and no in-progress upload is canceled. Confirm the eventual deployed source includes the intended checkpoints and matches latest observed main, or is truthfully marked behind with reconciliation pending.

No live deployment is part of these steps. A user-provided version label is a request label; exact source SHA and included checkpoints identify the delivered code.

## Requesting verification or deployment

Use GitHub **Actions → CMS Sandbox shared publisher → Run workflow**, select branch `main`, and select `verify` or `deploy`. Supply a full 40-character checkpoint SHA that must be in main, or leave blank to require the request's main SHA. The selected deployment may include later main commits. `release_label` is optional; leave internal `reconcile_count` at zero.

After prerequisite Git synchronization has succeeded, the CLI equivalent is:

```sh
gh workflow run cms-sandbox-publisher.yml --repo mgehling14/COMPASS---Test --ref main -f mode=verify
# Only for an explicitly authorized Sandbox deployment, after activation:
gh workflow run cms-sandbox-publisher.yml --repo mgehling14/COMPASS---Test --ref main -f mode=deploy -f required_sha=<full-checkpoint-sha> -f release_label=<request-version>
```

Read the run's logs and `cms-sandbox-publisher-<run-id>-<attempt>` artifact. The JSON receipt separates requested checkpoint, selected/deployed source, latest observed main, result, behind status, and reconciliation. No GitHub push or successful verify run should be reported as an app deployment.

## Stopping and recovery

For planned shutdown, stop new dispatches and let active uploads finish. Set `COMPASS_SANDBOX_PUBLISHER_ENABLED=false` to prevent future deploy runs; do not race or cancel a current upload. Do not use a laptop as a workaround. A failed validation leaves the current app untouched. An upload failure may be ambiguous; inspect the recorded source/result and the app before retrying through the queue. Do not automatically roll back or deploy an older SHA: recovery needs explicit authorization and the same queue/target checks.

GitHub users with sufficient access can still manually cancel a run or edit the workflow; these administrative actions are not prevented by `cancel-in-progress: false`. The team must honor the no-cancel/no-direct-publish rule. Keep permission changes and backend modifications separately authorized.

## Sources

- [Microsoft service-principal publishing requirements](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/use-service-principal)
- [Power Apps CLI reference](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/reference/cli)
- [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
