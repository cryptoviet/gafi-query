import { SubstrateExtrinsic, SubstrateEvent, SubstrateBlock } from "@subql/types";
import { Transfer, BlockEntity, SponsoredPool, UserJoinedPool, User, ClaimedContract } from "../types";
import { Balance } from "@polkadot/types/interfaces";

export async function handleBlock(block: SubstrateBlock): Promise<void> {
  let record = new BlockEntity(block.block.header.hash.toString());

  record.field1 = block.block.header.number.toNumber();
  await record.save();
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  const [from, to, amount, ...rest] = event.event.data;

  const transfer = new Transfer(`${event.block.block.header.number.toNumber()}-${event.idx}`);

  transfer.blockNumber = event.block.block.header.number.toBigInt();
  transfer.from = from.toString();
  transfer.to = to.toString();
  transfer.amount = (amount as Balance).toBigInt();
  await transfer.save();
}

export async function handleCall(extrinsic: SubstrateExtrinsic): Promise<void> {
  const record = await BlockEntity.get(extrinsic.block.block.header.hash.toString());

  record.field4 = extrinsic.block.timestamp;
  record.field5 = true;
  await record.save();
}

// index create sponsored pool to show list of them in dashboard. Temporary get data from args.
export async function handleCreateSponsoredPool(event: SubstrateEvent): Promise<void> {
  logger.info(`created pool ${event.block.hash.toString()}`);
  const {
    extrinsic: eventExtrinsic,
    event: {
      data: [poolId]
    }
  } = event;
  
  if (eventExtrinsic && poolId) {
    const { extrinsic, block, success } = eventExtrinsic;
    if (success) {
      const createdPool = new SponsoredPool(poolId.toString());

      createdPool.createdAt = block.timestamp;
      createdPool.poolOwner = extrinsic.signer.toString();
      createdPool.targets = extrinsic.args[0] as unknown as string[];
      createdPool.amount = extrinsic.args[1] as unknown as bigint;
      createdPool.discount = extrinsic.args[2] as unknown as number;
      createdPool.txLimit = extrinsic.args[3] as unknown as number;
      createdPool.totalUsers = 0;
      await createdPool.save();
    }
  }
}

export async function handleUserJoinPool(event: SubstrateEvent): Promise<void> {
  const userJoined = new UserJoinedPool(`${event.block.block.header.number.toNumber()}-${event.idx}`);
  logger.info(`joined pool ${event.block.hash.toString()}`);
  const {
    extrinsic: eventExtrinsic,
    event: {
      data: [, poolInfo]
    }
  } = event;

  const parsedPoolInfo = JSON.parse(poolInfo.toString())
  
  if (eventExtrinsic && parsedPoolInfo.sponsored) {
    const { extrinsic, block, success } = eventExtrinsic;
    if (success) {
      logger.info(`parsedPoolInfo.sponsored: ${parsedPoolInfo.sponsored}`)
      const pool = await SponsoredPool.get(parsedPoolInfo.sponsored);
      let user = await User.get(extrinsic.signer.toString())
      if (!user) {
        user = new User(extrinsic.signer.toString())
        user.createdAt = block.timestamp; 
      } 
      pool.totalUsers += 1;
      userJoined.poolId = pool.id;

      userJoined.createdAt = block.timestamp;
      userJoined.accountId = user.id;
      
      await user.save();
      await userJoined.save();
      await pool.save();
    }
  }
}

export async function handleClaimContract(event: SubstrateEvent): Promise<void> {
  logger.info(`claimed contract ${event.block.hash.toString()}`);

  const {
    extrinsic: eventExtrinsic,
    event: {
      data: [contractAddress, accountAddress]
    }
  } = event;

  if (eventExtrinsic) {
    const { extrinsic, block, success } = eventExtrinsic;

    let userClaim = await User.get(accountAddress.toString());
    if (!userClaim) {
      userClaim = new User(accountAddress.toString())
      userClaim.createdAt = block.timestamp; 
    }
    
    if (success) {
      const claimedContract = new ClaimedContract(contractAddress.toString());

      claimedContract.contractAddress = contractAddress.toString();
      claimedContract.createdAt = block.timestamp;
      claimedContract.accountId = userClaim.id.toString();
      await userClaim.save();
      await claimedContract.save();
    }
  }
}

export async function handleChangeContractOwnership(event: SubstrateEvent): Promise<void> {
  logger.info(`change contract ownership ${event.block.hash.toString()}`);

  const {
    extrinsic: eventExtrinsic,
    event: {
      data: [contractAddress, newOwner]
    }
  } = event;

  if (eventExtrinsic) {
    const { extrinsic, block, success } = eventExtrinsic;

    let newContractOwner = await User.get(newOwner.toString());
    if (!newContractOwner) {
      newContractOwner = new User(newOwner.toString())
      newContractOwner.createdAt = block.timestamp; 
    }
    
    if (success) {
      const claimedContract = await ClaimedContract.get(contractAddress.toString());

      if (claimedContract) {
        claimedContract.contractAddress = contractAddress.toString();
        claimedContract.updatedAt = block.timestamp;
        claimedContract.accountId = newContractOwner.id.toString();

        await newContractOwner.save();
        await claimedContract.save();
      }

    }
  }
}

export async function handleSponsoredPoolNewTargets(extrinsic: SubstrateExtrinsic): Promise<void> {
  logger.info(`Sponsored Pool new targets ${extrinsic.block.hash.toString()}`);

  if (extrinsic.success) {
    const record = await SponsoredPool.get(extrinsic.extrinsic.args[0] as unknown as string);

    if (record) {
      record.updatedAt = extrinsic.block.timestamp;
      record.targets = extrinsic.extrinsic.args[1] as unknown as string[];
      
      await record.save();
    }

  }
}

export async function handleSponsoredPoolWithdraw(extrinsic: SubstrateExtrinsic): Promise<void> {
  logger.info(`Sponsored Pool withdraw ${extrinsic.block.hash.toString()}`);

  if (extrinsic.success) {
    await SponsoredPool.remove(extrinsic.extrinsic.args[0] as unknown as string);
  }
}