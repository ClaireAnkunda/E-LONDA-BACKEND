// seed.js

// 🌟 Step 1: Configuration and Setup
// Load environment variables (our crucial secrets and config)
require('dotenv').config();
// The main database interface (Prisma ORM)
const { PrismaClient } = require('@prisma/client');
// Library for securely hashing passwords (essential for security!)
const bcrypt = require('bcryptjs'); 

// Initialize the Prisma client to interact with the database
const prisma = new PrismaClient();

/**
 * 🚀 The main function that orchestrates the entire database seeding process.
 */
async function main() {
  console.log('🌱 Starting database seed for secure election platform...');

  // --- 🔒 Admin Credentials Check ---
  // We fetch the critical admin details from the .env file.
  // Using default values ensures the script runs, but strongly encourages changing them!
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@organization.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const adminName = process.env.ADMIN_NAME || 'Election Administrator';

  if (!adminEmail || !adminPassword) {
    // Safety check: If these aren't set, we can't create the superuser.
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file to secure the initial setup.');
  }
  
  // ---------------------------------------------------------------------
  
  // --- 🗑️ Clean Up (A fresh start for non-admin data) ---
  // Delete all users who are NOT the Admin. This is a safety measure 
  // to ensure consistent state and remove stale test accounts during development/re-seeding.
  const deletedCount = await prisma.user.deleteMany({
    where: {
      role: {
        not: 'ADMIN' // Only target users whose role is not 'ADMIN'
      }
    }
  });
  console.log(`🗑️ Deleted ${deletedCount.count} old non-admin users (Officers, Candidates, etc.) to ensure a clean slate.`);

  // ---------------------------------------------------------------------
  
  // --- 👑 Create or Update the Election Administrator ---
  
  // 🔑 Security first: Hash the admin password using bcrypt (cost factor 12 is robust)
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  
  // Use Prisma's `upsert`:
  // 1. Check if the admin email exists (`where`).
  // 2. If EXISTS (`update`): Update the password, name, and ensure status is ACTIVE.
  // 3. If NOT EXISTS (`create`): Create the new admin account with the highest privilege.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      password: hashedPassword,
      name: adminName,
      status: 'ACTIVE',
      emailVerified: true, // Auto-verify the system admin
    },
    create: {
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      name: adminName,
      role: 'ADMIN', // The critical role assignment!
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  console.log('✅ Created/Updated the Super Administrator:', admin.email);

  // --- 💡 Important Design Note (Security and Audit) ---
  // Note: We intentionally AVOID creating dummy positions, voters, or candidates here.
  // In a real election system, these sensitive entities must be created via the 
  // Admin Dashboard interface to ensure proper data validation, audit trail logging, 
  // and adherence to business logic. The seed file should only handle the system's 
  // initial core setup (like the first admin).
  // ---------------------------------------------------------------------

  // --- 📝 Audit Logging ---
  // Record the action of running the database seed for transparency.
  await prisma.auditLog.create({
    data: {
      actorType: 'system', // The action was initiated by the system, not a user
      action: 'SEED_DATABASE',
      entity: 'system',
      payload: {
        adminCreated: true,
        adminEmail: admin.email,
      },
    },
  });

  console.log('✅ Database seed completed successfully!');
  console.log('\n📝 Initial Admin Credentials (from .env):');
  console.log(`Email: ${admin.email}`);
  console.log('Password: [Set securely in ADMIN_PASSWORD in .env]');
  console.log('\n💡 Next Step: Log in with these credentials to the Admin Dashboard to set up positions and other users.');
}

// ---------------------------------------------------------------------

// --- Execution and Error Handling ---
// Run the main function and handle any potential errors gracefully.
main()
  .catch((e) => {
    console.error('❌ A fatal seed error occurred:', e);
    // Exit with a failure code
    process.exit(1);
  })
  .finally(async () => {
    // 🛑 Always disconnect Prisma client when finished, regardless of success or failure.
    await prisma.$disconnect();
  });
