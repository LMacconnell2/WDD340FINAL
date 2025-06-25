import db from './db.js';
const createPermissionsTable = `
    CREATE TABLE IF NOT EXISTS permissions (
        permission_id INT PRIMARY KEY,
        permission_name VARCHAR(15) NOT NULL
    );
`;

const createUserTable = `
    CREATE TABLE IF NOT EXISTS user (
        i_number INT PRIMARY KEY,
        fname VARCHAR(45) NOT NULL,
        lname VARCHAR(45) NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(45) NOT NULL,
        permission_id INT NOT NULL REFERENCES permissions(permission_id)
    );
`;

const createReservationTable = `
    CREATE TABLE IF NOT EXISTS reservation (
        reserve_id INT PRIMARY KEY,
        i_number INT NOT NULL REFERENCES user(i_number),
        room_id CHAR(10) NOT NULL REFERENCES room(room_id),
        event_name VARCHAR(45) NOT NULL,
        date DATE NOT NULL,
        time_start TIME NOT NULL,
        time_end TIME NOT NULL,
        event_desc TEXT,
        people_count INT NOT NULL,
        confirmed TINYINT NOT NULL
    );
`;

const createRoomTable = `
    CREATE TABLE IF NOT EXISTS room (
        room_id CHAR(10) PRIMARY KEY,
        building_id CHAR(3) NOT NULL REFERENCES building(building_id),
        floor_number TINYINT NOT NULL,
        max_occupancy INT NOT NULL,
        room_desc TEXT,
        permission_id INT NOT NULL REFERENCES permissions(permission_id)
    );
`;

const createBuildingTable = `
    CREATE TABLE IF NOT EXISTS building (
        building_id CHAR(3) PRIMARY KEY,
        building_name VARCHAR(45) NOT NULL,
        time_open TIME NOT NULL,
        time_closed TIME NOT NULL
    );
`;

const insertPermissions = `
    INSERT INTO permissions (permission_id, permission_name) VALUES
        (0, 'Admin'),
        (1, 'Faculty'),
        (2, 'Leader'),
        (3, 'Assistant'),
        (4, 'Student'),
        (5, 'User')
    ON CONFLICT DO NOTHING;
`;
 
/**
 * Sets up the database by creating tables and inserting initial data.
 * This function should be called when the server starts.
 */
const setupDatabase = async () => {
    const verbose = process.env.DISABLE_SQL_LOGGING !== 'true';
 
    try {
        if (verbose) console.log('Setting up database...');
 
        // Create the permissions table
        await db.query(createPermissionsTable);
        if (verbose) console.log('Permissions table ready');
 
        // Create the user table
        await db.query(createUserTable);
        if (verbose) console.log('User table ready');

        // Create the reservation table
        await db.query(createReservationTable);
        if (verbose) console.log('Reservation table ready');

        // Create the room table
        await db.query(createRoomTable);
        if (verbose) console.log('Room table ready');

        // Create the Nuilding table
        await db.query(createBuildingTable);
        if (verbose) console.log('Building table ready');

        // Insert permisions
        await db.query(insertPermissions);
        if (verbose) console.log('Permissions inserted');
 
        if (verbose) console.log('Database setup complete');
        return true;
    } catch (error) {
        console.error('Error setting up database:', error.message);
        throw error;
    }
};
 
/**
 * Tests the database connection by executing a simple query.
 */
const testConnection = async () => {
    try {
        const result = await db.query('SELECT NOW() as current_time');
        console.log('Database connection successful:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
};
 
export { setupDatabase, testConnection };