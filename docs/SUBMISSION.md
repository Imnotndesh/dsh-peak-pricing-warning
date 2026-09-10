# Submission status

Both list submissions are open. One is blocked on a CI gate that is purely a
function of time, so there is nothing to fix — only to wait and re-run.

## Open PRs

| List | PR | State |
| --- | --- | --- |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | [#4811](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/4811) | Open — CI failed on repo age |
| [SihanTeng/awesome-deepseek-harness-plugins](https://github.com/SihanTeng/awesome-deepseek-harness-plugins) | [#44](https://github.com/SihanTeng/awesome-deepseek-harness-plugins/pull/44) | Open — no age gate |

## The gate

`awesome-dsh-plugin`'s contributing guide states, verbatim:

> The repo is at least **1 day old**. … This is checked automatically. It isn't a
> judgement about your plugin — it filters out repos created minutes before the
> PR, which were the bulk of what had to be rejected by hand. If you're just
> under the bar, finish the work and resubmit; nothing is held against a
> resubmission.

The repo was created `2026-09-10T16:25:13Z`, so it clears the check at
**2026-09-10T16:25:13Z on 2026-09-11**.

Nothing in the submission needs to change. The entry already satisfies every
other requirement: `dsh.bundle.patch` is declared and the referenced
`cordis.patch.yml` is committed, the repo carries the `dsh-plugin` topic, the
code is real and tested, and the single YAML entry file is the whole submission.

## To re-run

Re-run the failed workflow, or push an empty commit to re-trigger CI:

```sh
gh workflow run --repo awesome-dsh-plugin/awesome-dsh-plugin
# or, to re-trigger via a new commit on the fork branch:
git commit --allow-empty -m "Re-run CI: repo now over 1 day old" && git push
```

The fork branch is `Imnotndesh:main` in the `.sub` clone. If that clone is gone,
re-clone and re-apply `data/plugins/Imnotndesh__dsh-peak-pricing-warning.yml`.

## Secondary, no PR needed

Adding the `dsh-plugin` topic (already done) auto-enrols the repo in several
catalogues that discover by topic rather than by pull request, so those will
pick it up on their own schedule.
