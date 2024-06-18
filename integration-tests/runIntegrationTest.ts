import * as fs from "fs-extra"
import { join, resolve } from "../src/path"
import * as tmp from "tmp"
import { spawnSafeSync } from "../src/spawnSafe"
import { resolveRelativeFileDependencies } from "../src/resolveRelativeFileDependencies"
import rimraf from "rimraf"

export const patchPackageTarballPath = resolve(
  fs
    .readdirSync(".")
    .filter((nm) => nm.match(/^patch-package\.test\.\d+\.tgz$/))[0],
)

export function runIntegrationTest({
  projectName,
  exitCode = 0,
  shouldProduceSnapshots = false,
}: {
  projectName: string
  exitCode?: number
  shouldProduceSnapshots?: boolean
}) {
  describe(`Test ${projectName}:`, () => {
    const tmpDir = tmp.dirSync({ unsafeCleanup: true })
    fs.copySync(join(__dirname, projectName), tmpDir.name, {
      recursive: true,
    })

    // remove node_modules folder when running locally, to avoid leaking state from source dir
    rimraf.sync(join(tmpDir.name, "node_modules"))

    const packageJson = require(join(tmpDir.name, "package.json"))
    packageJson.dependencies = resolveRelativeFileDependencies(
      join(__dirname, projectName),
      packageJson.dependencies,
    )

    fs.writeFileSync(
      join(tmpDir.name, "package.json"),
      JSON.stringify(packageJson),
    )

    const result = spawnSafeSync(
      `./${projectName}.sh`,
      [patchPackageTarballPath],
      {
        cwd: tmpDir.name,
        throwOnError: false,
        env: {
          ...process.env,
          PATCH_PACKAGE_INTEGRATION_TEST: "1",
        },
        shell: true,
      },
    )

    it(`should exit with ${exitCode} status`, () => {
      expect(result.status).toBe(exitCode)
    })

    const output = result.stdout.toString() + "\n" + result.stderr.toString()

    if (result.status !== 0) {
      console.log(output)
    }

    it("should produce output", () => {
      expect(output.trim()).toBeTruthy()
    })

    const snapshots = output.match(/SNAPSHOT: ?([\s\S]*?)END SNAPSHOT/g)

    if (shouldProduceSnapshots) {
      it("should produce some snapshots", () => {
        expect(snapshots && snapshots.length).toBeTruthy()
      })
      if (snapshots) {
        snapshots.forEach((snapshot, i) => {
          const snapshotDescriptionMatch = snapshot.match(/SNAPSHOT: (.*)/)
          if (snapshotDescriptionMatch) {
            it(
              `${i.toString().padStart(2, "0")}: ` +
                snapshotDescriptionMatch[1],
              () => {
                expect(snapshot).toMatchSnapshot()
              },
            )
          } else {
            throw new Error("bad snapshot format")
          }
        })
      }
    } else {
      it("should not produce any snapshots", () => {
        expect(snapshots && snapshots.length).toBeFalsy()
      })
    }
  })
}
