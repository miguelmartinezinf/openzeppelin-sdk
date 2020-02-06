import { pickBy } from 'lodash';

import { Loggy } from '@openzeppelin/upgrades';
import { ProxyType, CreateParams } from '../../scripts/interfaces';
import { Contract } from '@openzeppelin/upgrades';
import { validateSalt } from '../../utils/input';

import link from '../link';
import add from '../add';
import push from '../push';

import { getConstructorInputs } from '@openzeppelin/upgrades';
import { transpileAndSaveContracts } from '../../transpiler';

import ConfigManager from '../../models/config/ConfigManager';
import Session from '../../models/network/Session';
import { compile } from '../../models/compiler/Compiler';
import { fromContractFullName } from '../../utils/naming';
import NetworkController from '../../models/network/NetworkController';
import stdout from '../../utils/stdout';
import { parseMultipleArgs } from '../../utils/input';

import { Options, Args } from './spec';

export async function preAction(params: Options & Args): Promise<void | (() => Promise<void>)> {
  if (!params.skipCompile) {
    await compile();
  }

  // If the user requests upgradeability via flag, we short circuit to the
  // create action. This avoid issues parsing deploy arguments due to the
  // deploy action being unaware of initializer functions.
  if (params.kind && params.kind !== 'regular') {
    return () => runCreate(params);
  }
}

export async function action(params: Options & Args): Promise<void> {
  if (params.kind && params.kind !== 'regular') {
    return runCreate(params);
  }

  const { contract: contractName, arguments: deployArgs } = params;

  if (params.network === undefined) {
    const { network: lastNetwork, expired } = Session.getNetwork();
    if (!expired) {
      params.network = lastNetwork;
    }
  }

  const { network, txParams } = params;

  // Used for network preselection in subsequent runs.
  Session.setDefaultNetworkIfNeeded(network);

  const { package: packageName, contract: contractAlias } = fromContractFullName(contractName);

  const controller = new NetworkController(network, txParams, params.networkFile);

  const contract = controller.contractManager.getContractClass(packageName, contractAlias);
  const constructorInputs = getConstructorInputs(contract);

  const args = parseMultipleArgs(deployArgs, constructorInputs);

  try {
    const instance = await controller.createInstance(packageName, contractAlias, args);
    stdout(instance.address);
  } finally {
    controller.writeNetworkPackageIfNeeded();
  }
}

async function runCreate(params: Options & Args): Promise<void> {
  if (params.arguments.length > 0) {
    // Translate arguments to syntax expected by create.
    params['args'] = params.arguments.join(',');
  }

  if (params.kind === 'minimal') {
    params['minimal'] = true;

    // because we already compiled
    params.skipCompile = true;

    await createAction(params.contract, params);
  }

  // transpile contracts
  if (params.kind === 'upgradeable') {
    const { contract: contractName, arguments: deployArgs } = params;

    await transpileAndSaveContracts([contractName]);
    await createAction(params.contract, params);
  }
}

async function createAction(contractFullName: string, options: any): Promise<void> {
  if (options.minimal) {
    Loggy.noSpin.warn(__filename, 'action', 'create-minimal-proxy', 'Minimal proxy support is still experimental.');
  }
  const { skipCompile } = options;
  if (!skipCompile) await compile();

  const { network, txParams } = await ConfigManager.initNetworkConfiguration({
    ...options,
    network: options.network,
  });

  await add.runActionIfNeeded(`${contractFullName}Upgradable:${contractFullName}`, options);
  await push.runActionIfNeeded([contractFullName], network, {
    ...options,
    network: options.network,
  });

  const { force } = options;
  const { contract: contractAlias, package: packageName } = fromContractFullName(contractFullName);

  const args = pickBy({
    packageName,
    contractAlias,
    force,
  } as CreateParams);

  if (options.minimal) args.kind = ProxyType.Minimal;

  await createProxy({ ...args, network, txParams });
  Session.setDefaultNetworkIfNeeded(network);
}

async function createProxy({
  packageName,
  contractAlias,
  methodName,
  methodArgs,
  network,
  txParams = {},
  force = false,
  salt = null,
  signature = null,
  admin = null,
  kind = ProxyType.Upgradeable,
  networkFile,
}: Partial<CreateParams>): Promise<Contract | never> {
  if (!contractAlias) throw Error('A contract alias must be provided to create a new proxy.');
  validateSalt(salt, false);

  const controller = new NetworkController(network, txParams, networkFile);
  try {
    await controller.checkContractDeployed(packageName, contractAlias, !force);
    const proxy = await controller.createProxy(
      packageName,
      contractAlias,
      methodName,
      methodArgs,
      admin,
      salt,
      signature,
      kind,
    );
    stdout(proxy.address);

    return proxy;
  } finally {
    controller.writeNetworkPackageIfNeeded();
  }
}
