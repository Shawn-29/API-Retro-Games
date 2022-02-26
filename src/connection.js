const mySQL = require('mysql');

const getConnectionPool = async ({
    host,
    user,
    password,
    database
}) => {
    return new Promise((resolve, reject) => {
        try {
            const connection = mySQL.createPool({
                host,
                user,
                password,
                database,
                multipleStatements: true
            });
            resolve(connection);
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = getConnectionPool;