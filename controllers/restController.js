const { sequelize } = require('../models')
const db = require('../models')
const Restaurant = db.Restaurant
const Category = db.Category
const Comment = db.Comment
const User = db.User

const helpers = require('../_helpers')

const pageLimit = 10

const restController = {
  getRestaurants: async (req, res) => {
    let offset = 0
    const whereQuery = {}
    let categoryId = ''

    if (req.query.page) {
      offset = (req.query.page - 1) * pageLimit
    }

    if (req.query.categoryId) {
      categoryId = Number(req.query.categoryId)
      whereQuery.CategoryId = categoryId
    }

    const [categories, result] = await Promise.all([
      Category.findAll({ raw: true, nest: true }),
      Restaurant.findAndCountAll({
        include: Category,
        where: whereQuery,
        offset: offset,
        limit: pageLimit
      })
    ])

    // data for pagination
    const page = Number(req.query.page) || 1
    const pages = Math.ceil(result.count / pageLimit)
    const totalPage = Array.from({ length: pages }).map((_, index) => index + 1)
    const prev = page - 1 < 1 ? 1 : page - 1
    const next = page + 1 > pages ? pages : page + 1

    // clean up restaurant data
    const favRestaurants = helpers
      .getUser(req)
      .FavoritedRestaurants.map(favRestaurant => favRestaurant.id)
    const likeRestaurants = helpers
      .getUser(req)
      .LikedRestaurants.map(likeRestaurant => likeRestaurant.id)

    const data = result.rows.map(restaurant => ({
      ...restaurant.dataValues,
      description: restaurant.dataValues.description.substring(0, 50),
      categoryName: restaurant.Category.name,
      isFavorited: favRestaurants.includes(restaurant.id),
      isLiked: likeRestaurants.includes(restaurant.id)
    }))

    return res.render('restaurants', {
      restaurants: data,
      categories,
      categoryId,
      page,
      totalPage,
      prev,
      next
    })
  },
  getRestaurant: async (req, res) => {
    const restaurant = await Restaurant.findByPk(req.params.id, {
      include: [
        Category,
        { model: Comment, include: [User] },
        { model: User, as: 'FavoritedUsers' },
        { model: User, as: 'LikedUsers' }
      ]
    })
    const isFavorited = restaurant.FavoritedUsers.map(
      favUser => favUser.id
    ).includes(helpers.getUser(req).id)
    const isLiked = restaurant.LikedUsers.map(likeUser => likeUser.id).includes(
      helpers.getUser(req).id
    )

    // Count unique page views to show on dashboard
    if (!req.session.views[req.params.id]) {
      req.session.views[req.params.id] = 1

      restaurant.viewCounts = restaurant.viewCounts
        ? restaurant.viewCounts + 1
        : 1

      await restaurant.save()
    }

    res.render('restaurant', {
      restaurant: restaurant.toJSON(),
      isFavorited,
      isLiked
    })
  },
  getFeeds: async (req, res) => {
    const [restaurants, comments] = await Promise.all([
      Restaurant.findAll({
        limit: 10,
        raw: true,
        nest: true,
        order: [['createdAt', 'DESC']],
        include: [Category]
      }),
      Comment.findAll({
        limit: 10,
        raw: true,
        nest: true,
        order: [['createdAt', 'DESC']],
        include: [User, Restaurant]
      })
    ])

    res.render('feeds', { restaurants, comments })
  },
  getDashboard: async (req, res) => {
    const restaurant = await Restaurant.findByPk(req.params.id, {
      include: [Category, { model: Comment, include: [User] }]
    })
    res.render('dashboard', { restaurant: restaurant.toJSON() })
  },
  getTopRestaurant: async (req, res) => {
    let restaurants = await Restaurant.findAll({
      include: { model: User, as: 'FavoritedUsers' },
      attributes: [
        'id',
        'description',
        'image',
        'name',
        [
          sequelize.literal(
            '(SELECT COUNT(*) FROM Favorites WHERE Favorites.RestaurantId = Restaurant.id GROUP BY Favorites.RestaurantId)'
          ),
          'favCount'
        ]
      ],
      order: [[sequelize.literal('favCount'), 'DESC']],
      limit: 10
    })

    // Clean up restaurants data
    const favRestaurants = req.user.FavoritedRestaurants.map(
      favRestaurant => favRestaurant.id
    )

    restaurants = restaurants.map(restaurant => ({
      ...restaurant.dataValues,
      description: restaurant.description.substring(0, 50),
      favCount: restaurant.FavoritedUsers.length,
      isFavorited: favRestaurants.includes(restaurant.id)
    }))

    res.render('topRestaurant', { restaurants })
  }
}

module.exports = restController
