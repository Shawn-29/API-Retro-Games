const mySQL = require('mysql');
const NodeCache = require('node-cache');
const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_DB_CONNECTION } = require('../symbols');

/* valid items per page */
const DEFAULT_IPL = 25;
const validIPL = new Set([
    DEFAULT_IPL,
    50,
    100,
    200
]);

const SYM_COLUMN_CACHE_KEY = Symbol('column names');

const NodeCache_Allow_Symbols = class extends NodeCache {
    constructor(options = {}) {
        super(options);
        /* need to extend the valid permitted types to allow symbol usage */
        this.validKeyTypes = [
            ...this.validKeyTypes,
            'symbol'
        ];
    }
};

const queryCache = new NodeCache_Allow_Symbols();

const cacheColumnNames = async (connection) => {
    return new Promise((resolve, reject) => {

        const validColumnsCache = {
            platforms: null,
            publishers: null,
            developers: null,
            genres: null,
            releaseYears: null
        };

        const platformQuery = 'SELECT name FROM platforms',
            publisherQuery = 'SELECT name FROM publishers',
            developerQuery = 'SELECT name FROM developers',
            genreQuery = 'SELECT type AS name FROM genres',
            yearQuery = 'SELECT DISTINCT release_year AS name FROM games';

        connection.query(`${platformQuery};${publisherQuery};${developerQuery};${genreQuery};${yearQuery}`, (err, res) => {
            if (err) {
                reject(err);
            }
            let index = 0;
            for (const key of Object.keys(validColumnsCache)) {
                validColumnsCache[key] = new Set(res[index].map(value => String(value.name).toLocaleLowerCase()));
                ++index;
            }

            queryCache.set(SYM_COLUMN_CACHE_KEY, validColumnsCache);

            resolve();
        });
    });
};

/* get a list of games based on filters provided in the query string */
const getGames = async (req, res) => {

    const connection = res.locals[SYM_DB_CONNECTION];

    if (!queryCache.has(SYM_COLUMN_CACHE_KEY)) {
        await cacheColumnNames(connection);
    }

    const validColumnsCache = queryCache.get(SYM_COLUMN_CACHE_KEY);

    /* these are the only valid categories that games can be filtered by */
    const tblFilters = {};
    for (const key of Object.keys(validColumnsCache)) {
        tblFilters[key] = {
            values: [''],
            placeholders: '?',
            filterApplied: false
        }
    }

    for (const key of Object.keys(tblFilters)) {
        /* check if this filter type is included in the query params */
        if (!req.query[key]) {
            continue;
        }

        const values = Array.from(
            /* separated columns names from the query string and remove duplicates */
            new Set(req.query[key].split('|')))
            /* lowercase column names for consistent caching (e.g. "NES" and "nes" should be the same) */
            .map(str => str.toLowerCase())
            /* remove invalid column names that might be in the query string */
            .filter(value => validColumnsCache[key].has(value)
            );

        if (values.length === 0) {
            continue;
        }

        tblFilters[key] = {
            values,

            /* create a placeholder for each value in order to escape each value in the query */
            placeholders: Array.from(values, _ => '?').join(', '),

            /* search params for this filter has been found so we will no longer
                retrieve all the results for this category */
            filterApplied: true
        };
    }

    const cacheKey = Object.values(tblFilters).flatMap(filter => filter.values).join('');

    const cacheResult = queryCache.get(cacheKey);
    if (cacheResult) {
        return res.status(OK)
            .json(cacheResult);
    }

    /* build filter conditions for each category */
    const platformFilter = !tblFilters.platforms.filterApplied ? 1 :
        mySQL.format(`p.name IN (${tblFilters.platforms.placeholders})`,
            [...tblFilters.platforms.values]
        );
    const publisherFilter = !tblFilters.publishers.filterApplied ? 1 :
        mySQL.format(`pl.name IN (${tblFilters.publishers.placeholders})`,
            [...tblFilters.publishers.values]
        );
    const developerFilter = !tblFilters.developers.filterApplied ? 1 :
        mySQL.format(`d.name IN (${tblFilters.developers.placeholders})`,
            [...tblFilters.developers.values]
        );
    const genreFilter = !tblFilters.genres.filterApplied ? 1 :
        mySQL.format(`gr.type IN (${tblFilters.genres.placeholders})`,
            [...tblFilters.genres.values]
        );
    const yearFilter = !tblFilters.releaseYears.filterApplied ? 1 :
        mySQL.format(`gm.release_year IN (${tblFilters.releaseYears.placeholders})`,
            [...tblFilters.releaseYears.values]
        );

    /* get subqueries for tables other than the main game table to use for count queries */
    const platSub = !tblFilters.platforms.filterApplied ? 1 :
        `platform_id IN (SELECT id FROM platforms p WHERE ${platformFilter})`;
    const pubSub = !tblFilters.publishers.filterApplied ? 1 :
        `publisher_id IN (SELECT id FROM publishers pl WHERE ${publisherFilter})`;
    const devSub = !tblFilters.developers.filterApplied ? 1 :
        `developer_id IN (SELECT id FROM developers d WHERE ${developerFilter})`;
    const genSub = !tblFilters.genres.filterApplied ? 1 :
        `genre_id IN (SELECT id FROM genres gr WHERE ${genreFilter})`;

    /* count total rows */
    const countQuery = `
        SELECT COUNT(*) total_rows
        FROM games gm
        WHERE
            ${yearFilter} && ${platSub} &&
            ${pubSub} && ${devSub} && ${genSub};
    `;

    /* start querying the database by getting the total number of filtered rows */
    let total_rows = 0;
    await new Promise((resolve, reject) => {
        connection.query(countQuery, (err, result) => {
            if (err) {
                reject(`count query rejected with reason: ${err.message}`);
            }
            else {
                resolve(result);
            }
        });
    })
        .then(value => {
            total_rows = value[0].total_rows;
        })
        .catch(reason => {
            console.log('rejected with reason:', reason);
        });

    /********** get pagination params **********/
    /* get the number of items per list */
    const ipl = validIPL.has(+req.query.ipl) ? +req.query.ipl : DEFAULT_IPL;
    /* get the maximum page number */
    const maxPgn = Math.ceil(total_rows / ipl);
    /* get the current page number */
    const pgn = Number.isSafeInteger(+req.query.pgn) ?
        Math.max(1, Math.min(req.query.pgn, maxPgn)) : 1;

    /* get individual category counts */
    const platformCountQuery = `
        SELECT p.name, count FROM platforms p
        RIGHT JOIN (
            SELECT platform_id, COUNT(*) count
            FROM games gm
            WHERE ${pubSub} && ${devSub} &&
                ${genSub} && ${yearFilter}
            GROUP BY platform_id
        ) gm ON p.id = gm.platform_id
        ORDER BY p.name ASC
    `;
    const publisherCountQuery = `
        SELECT pl.name, count FROM publishers pl
        RIGHT JOIN (
            SELECT publisher_id, COUNT(*) count
            FROM games gm
            WHERE ${platSub} && ${devSub} &&
                ${genSub} && ${yearFilter}
            GROUP BY publisher_id
        ) gm ON pl.id = gm.publisher_id
        ORDER BY pl.name ASC
    `;
    const developerCountQuery = `
        SELECT d.name, count FROM developers d
        RIGHT JOIN (
            SELECT developer_id, COUNT(*) count
            FROM games gm
            WHERE ${platSub} && ${pubSub} &&
                ${genSub} && ${yearFilter}
            GROUP BY developer_id
        ) gm ON d.id = gm.developer_id
        ORDER BY d.name ASC
    `;
    const genreCountQuery = `
        SELECT gr.type name, count FROM genres gr
        RIGHT JOIN (
            SELECT genre_id, COUNT(*) count
            FROM games gm
            WHERE ${platSub} && ${pubSub} &&
                ${devSub} && ${yearFilter}
            GROUP BY genre_id
        ) gm ON gr.id = gm.genre_id
        ORDER BY name ASC
    `;
    const yearCountQuery = `
        SELECT gm.release_year name, COUNT(*) count
        FROM games gm
        WHERE ${platSub} && ${pubSub} &&
            ${devSub} && ${genSub}
        GROUP BY gm.release_year
        ORDER BY gm.release_year ASC
    `;

    /* get a list of game data based on filters and pagination */
    const gameListQuery = mySQL.format(`
        WITH base AS (
            SELECT gm.id, gm.title, gm.description, gm.release_year,
                p.name platform, pl.name publisher, d.name developer,
                gr.type genre
            FROM games gm
            LEFT JOIN platforms p
                ON gm.platform_id = p.id
            LEFT JOIN publishers pl
                ON gm.publisher_id = pl.id
            LEFT JOIN developers d
                ON gm.developer_id = d.id
            LEFT JOIN genres gr
                ON gm.genre_id = gr.id
            WHERE ${platformFilter} && ${publisherFilter} && ${developerFilter} &&
                ${genreFilter} && ${yearFilter}
            ORDER BY gm.title ASC
            LIMIT ? OFFSET ?
        )
        SELECT title, description, release_year,
            platform, publisher, developer,
            genre,
            (
                SELECT GROUP_CONCAT(url SEPARATOR ',')
                FROM game_images
                WHERE b.id = game_id
            ) img_urls
        FROM base b
        GROUP BY title, description, release_year,
            platform, publisher, developer,
            genre, img_urls
    `,
        [
            ipl, ipl * (pgn - 1)
        ]);

    connection.query(`${gameListQuery}; ${platformCountQuery}; ${publisherCountQuery}; ${developerCountQuery}; ${genreCountQuery}; ${yearCountQuery}`,
        (err, result) => {
            if (err) {
                return res.status(NOT_FOUND)
                    .json({
                        result: [],
                        error: 'Could not get game data.'
                    });
            }

            const categories = {
                platforms: result[1].map(data => ({
                    ...data,
                    filterApplied: data.count > 0 && tblFilters.platforms.values.includes(data.name.toLowerCase())
                })),
                publishers: result[2].map(data => ({
                    ...data,
                    filterApplied: data.count > 0 && tblFilters.publishers.values.includes(data.name.toLowerCase())
                })),
                developers: result[3].map(data => ({
                    ...data,
                    filterApplied: data.count > 0 && tblFilters.developers.values.includes(data.name.toLowerCase())
                })),
                genres: result[4].map(data => ({
                    ...data,
                    filterApplied: data.count > 0 && tblFilters.genres.values.includes(data.name.toLowerCase())
                })),
                releaseYears: result[5].map(data => ({
                    ...data,
                    filterApplied: data.count > 0 && tblFilters.releaseYears.values.includes(String(data.name))
                })),
            };

            const data = {
                gameData: {
                    gameList: result[0],
                    categories,
                    totalGames: total_rows
                },
                pagination: {
                    curPage: pgn,
                    maxPage: maxPgn
                }
            };

            queryCache.set(cacheKey, data);

            res.status(OK)
                .json(data);
        });
};

module.exports = getGames;