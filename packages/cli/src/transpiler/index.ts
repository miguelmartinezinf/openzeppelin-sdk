import fs from 'fs-extra';
import path from 'path';

import { compile } from '../models/compiler/Compiler';
import { getBuildArtifacts } from '@openzeppelin/upgrades';
import { transpileContracts, OutputFile } from '@openzeppelin/upgradeability-transpiler';

export async function transpileAndSaveContracts(contracts: string[]): Promise<OutputFile[]> {
  await compile();
  const files = transpileContracts(contracts, getBuildArtifacts().listArtifacts());
  for (const file of files) {
    await fs.ensureDir(path.dirname(file.path));
    await fs.writeFile(file.path, file.source);
  }
  return files;
}
