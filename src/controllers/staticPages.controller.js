const staticPagesService = require('../service/staticPages.service');

async function getPublicStaticPage(req, res) {
  try {
    const page = await staticPagesService.getStaticPageByKey(req.params?.pageKey, {
      includeInactive: false,
    });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: page,
    });
  } catch (error) {
    console.error('Get public static page error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load page content',
    });
  }
}

async function listPublicStaticPages(req, res) {
  try {
    const pages = await staticPagesService.listStaticPages({ includeInactive: false });
    return res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error) {
    console.error('List public static pages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load page content',
    });
  }
}

module.exports = {
  getPublicStaticPage,
  listPublicStaticPages,
};
