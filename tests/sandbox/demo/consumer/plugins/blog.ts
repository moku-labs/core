import { createPlugin } from "../../moku-web";

export const blogPlugin = createPlugin("blog", {
  defaultConfig: {
    postsPerPage: 10,
    showDrafts: false
  },
  createState: () => ({
    posts: [] as Array<{ title: string; slug: string }>
  }),
  api: ctx => ({
    listPosts: () => ctx.state.posts,
    addPost: (title: string, slug: string) => {
      ctx.state.posts.push({ title, slug });
    },
    getPostsPerPage: () => ctx.config.postsPerPage
  })
});
