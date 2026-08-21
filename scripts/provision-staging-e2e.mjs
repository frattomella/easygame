import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const CONFIRMATION = "easygame-staging";
const password = String(process.env.E2E_STAGING_PASSWORD || "");
const clubId = String(process.env.E2E_STAGING_CLUB_ID || "").trim();

if (process.env.EASYGAME_ALLOW_STAGING_PROVISION !== CONFIRMATION) {
  throw new Error(
    `Provisioning refused: set EASYGAME_ALLOW_STAGING_PROVISION=${CONFIRMATION}`,
  );
}

if (password.length < 16) {
  throw new Error("E2E_STAGING_PASSWORD must contain at least 16 characters");
}

if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(clubId)) {
  throw new Error("E2E_STAGING_CLUB_ID must be an explicit club UUID");
}

const prisma = new PrismaClient();

const accounts = [
  {
    email: "staging.club-manager@easygame.invalid",
    firstName: "Staging",
    lastName: "Club Manager",
    role: "club_manager",
  },
  {
    email: "staging.collaborator@easygame.invalid",
    firstName: "Staging",
    lastName: "Collaboratore",
    role: "collaborator",
  },
  {
    email: "staging.staff@easygame.invalid",
    firstName: "Staging",
    lastName: "Staff",
    role: "staff",
  },
];

const existingAccounts = [
  { email: "demo@easygame.it", role: "owner" },
  { email: "trainer@easygame.it", role: "trainer" },
  { email: "parent@easygame.it", role: "parent" },
  { email: "athlete@easygame.it", role: "athlete" },
];

const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

try {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, name: true, trainers: true },
  });

  if (!club) {
    throw new Error(`Staging club ${clubId} not found`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const provisioned = [];
  const usersByRole = new Map();

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        password_hash: passwordHash,
        email_verified_at: new Date(),
        role: account.role,
        first_name: account.firstName,
        last_name: account.lastName,
        user_metadata: {
          name: `${account.firstName} ${account.lastName}`,
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
          stagingE2E: true,
        },
      },
      create: {
        email: account.email,
        password_hash: passwordHash,
        email_verified_at: new Date(),
        role: account.role,
        first_name: account.firstName,
        last_name: account.lastName,
        user_metadata: {
          name: `${account.firstName} ${account.lastName}`,
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
          stagingE2E: true,
        },
      },
      select: { id: true, email: true, role: true },
    });

    await prisma.organizationUser.upsert({
      where: {
        organization_id_user_id_role: {
          organization_id: club.id,
          user_id: user.id,
          role: account.role,
        },
      },
      update: { is_primary: true },
      create: {
        organization_id: club.id,
        user_id: user.id,
        role: account.role,
        is_primary: true,
      },
    });

    usersByRole.set(account.role, user);
    provisioned.push({ email: user.email, role: user.role });
  }

  for (const account of existingAccounts) {
    const user = await prisma.user.findUnique({
      where: { email: account.email },
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
      },
    });

    if (!user) {
      throw new Error(`Required staging user ${account.email} not found`);
    }

    await prisma.organizationUser.upsert({
      where: {
        organization_id_user_id_role: {
          organization_id: club.id,
          user_id: user.id,
          role: account.role,
        },
      },
      update: {},
      create: {
        organization_id: club.id,
        user_id: user.id,
        role: account.role,
        is_primary: false,
      },
    });

    usersByRole.set(account.role, user);
    provisioned.push({ email: user.email, role: account.role });
  }

  const trainerUser = usersByRole.get("trainer");
  const trainerRows = Array.isArray(club.trainers) ? club.trainers : [];
  const trainerAlreadyLinked = trainerRows.some((entry) => {
    const row = asRecord(entry);
    return (
      String(row.linkedUserId || row.linked_user_id || "") === trainerUser.id ||
      String(row.email || "").toLowerCase() === trainerUser.email.toLowerCase()
    );
  });

  if (!trainerAlreadyLinked) {
    await prisma.club.update({
      where: { id: club.id },
      data: {
        trainers: [
          ...trainerRows,
          {
            id: trainerUser.id,
            firstName: trainerUser.first_name || "Luca",
            lastName: trainerUser.last_name || "Trainer",
            name:
              [trainerUser.first_name, trainerUser.last_name]
                .filter(Boolean)
                .join(" ") || "Staging Trainer",
            email: trainerUser.email,
            linkedUserId: trainerUser.id,
            linkedUserEmail: trainerUser.email,
            role: "trainer",
            categories: [],
            stagingE2E: true,
          },
        ],
      },
    });
  }

  const athleteUser = usersByRole.get("athlete");
  const parentUser = usersByRole.get("parent");
  let athlete = await prisma.athlete.findFirst({
    where: { organization_id: club.id, user_id: athleteUser.id },
    select: { id: true, data: true },
  });

  if (!athlete) {
    athlete = await prisma.athlete.create({
      data: {
        organization_id: club.id,
        user_id: athleteUser.id,
        first_name: athleteUser.first_name || "Giulia",
        last_name: athleteUser.last_name || "Athlete",
        status: "active",
        data: { stagingE2E: true, guardians: [] },
      },
      select: { id: true, data: true },
    });
  }

  const athleteData = asRecord(athlete.data);
  const guardians = Array.isArray(athleteData.guardians)
    ? athleteData.guardians
    : [];
  const parentAlreadyLinked = guardians.some((entry) => {
    const guardian = asRecord(entry);
    return (
      String(guardian.linkedUserId || guardian.linked_user_id || "") ===
      parentUser.id
    );
  });

  if (!parentAlreadyLinked) {
    await prisma.athlete.update({
      where: { id: athlete.id },
      data: {
        data: {
          ...athleteData,
          guardians: [
            ...guardians,
            {
              name: parentUser.first_name || "Paolo",
              surname: parentUser.last_name || "Parent",
              relationship: "Genitore",
              email: parentUser.email,
              linkedUserId: parentUser.id,
              linkedUserEmail: parentUser.email,
              stagingE2E: true,
            },
          ],
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      { club: club.name, athleteId: athlete.id, provisioned },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
