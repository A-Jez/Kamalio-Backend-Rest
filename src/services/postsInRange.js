import geolib from 'geolib'
import Sequelize from 'sequelize'
import getDatabase from '../database'

const RANGES = {
    HERE: 500,
    VERY_CLOSE: 1000,
    CLOSE: 3000,
    FAR: 5000,
    VERY_FAR: 10000
}

export async function getPostsInRange(
    { latitude, longitude }, section, { offset = 0, limit = 20 }
) {
    const { sequelize } = getDatabase()
    const { PostLocation, Post, PostVote, Comment, User } = getDatabase().models

    let order

    if (section === 'BEST') {
        order = sequelize.literal('rating DESC')
    } else if (section === 'LOUDEST') {
        order = sequelize.literal('commentCount DESC')
    } else {
        order = sequelize.literal('"updatedAt" DESC')
    }

    const posts = await Post.findAndCountAll({
        attributes: [
            [
                sequelize.fn('coalesce',
                    sequelize.cast(
                        sequelize.fn('sum', sequelize.col('PostVotes.value')), 'INTEGER'
                    ),
                    0
                ),
                'rating'
            ],
            [
                sequelize.fn('coalesce',
                    sequelize.cast(
                        sequelize.fn('count', sequelize.col('Comments.id')), 'INTEGER'
                    ),
                    0
                ),
                'commentCount'
            ],
            'title',
            'content',
            'createdAt',
            'updatedAt',
            'userId',
            'id'
        ],
        include: [{
            model: PostVote,
            duplicating: false,
            attributes: [],
        }, {
            model: Comment,
            duplicating: false,
            attributes: [],
        }, {
            model: PostLocation,
            duplicating: false,
            //where: buildGeoQuery({ latitude, longitude, distance: RANGES.VERY_FAR }),
        }, {
            model: User,
            duplicating: false,
        }],
        distinct: true,
        offset,
        limit,
        order,
        group: ['Post.id', 'PostLocation.id', 'User.id'],
    })

    return posts
}

export async function mapPostsByDistance({ latitude, longitude }, posts) {
    const postsByDistance = {
        HERE: [],
        VERY_CLOSE: [],
        CLOSE: [],
        FAR: [],
        VERY_FAR: []
    }

    for (let i = 0; i < posts.length; ++i) {
        const { PostLocation: postLocation } = posts[i]
        const pLat = postLocation.latitude
        const pLon = postLocation.longitude

        const distance = geolib.getDistance(
            { latitude: pLat, longitude: pLon },
            { latitude, longitude }
        )

        const distanceLabels = Object.keys(RANGES)
        for (let j = 0; j < distanceLabels.length; ++j) {
            const distanceLabel = distanceLabels[j]
            if (distance < RANGES[distanceLabel]) {
                postsByDistance[distanceLabel].push(postLocation)
                break;
            }
        }
    }

    return postsByDistance
}

export function buildGeoQuery({ latitude, longitude, distance }) {
    const { minLat, maxLat, minLon, maxLon } = getBoundaries(latitude, longitude, distance)
    const Op = Sequelize.Op

    return Object.assign({}, {
        latitude: {
            [Op.gt]: minLat,
            [Op.lt]: maxLat
        },
        longitude: {
            [Op.gt]: minLon,
            [Op.lt]: maxLon
        }
    })
}

export function getBoundaries(lat, lon, dist) {
    const initialPoint = { lat, lon }

    const bears = [90, 180, 270, 360]

    let minLat = Number.MAX_VALUE
    let maxLat = -Number.MAX_VALUE
    let minLon = Number.MAX_VALUE
    let maxLon = -Number.MAX_VALUE

    bears.forEach(bearing => {
        const { latitude, longitude } = geolib.computeDestinationPoint(initialPoint, dist, bearing)
        minLat = Math.min(minLat, latitude)
        maxLat = Math.max(maxLat, latitude)
        minLon = Math.min(minLon, longitude)
        maxLon = Math.max(maxLon, longitude)
    })

    return { minLat, maxLat, minLon, maxLon }
}