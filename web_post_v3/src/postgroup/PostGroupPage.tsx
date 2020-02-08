import React, { useState, useEffect, FunctionComponent } from "react";
import PubSub from "pubsub-js";
import {
  postInfo,
  reply,
  showActivity,
  setTitle,
  toast,
  unloaded,
  download
} from "../jsbridge";
import { fetchPostGroup } from "./postUtils";
import { Post, Page, Status, XImage } from "./types.d";
import "./index.css";
import { Json } from "..";

const NOTIFICATION_TOTAL_PAGES_CHANGED = "NOTIFICATION_TOTAL_PAGES_CHANGED";
const NOTIFICATION_FORCE_LOAD_PAGE = "NOTIFICATION_FORCE_LOAD_PAGE";
const NOTIFICATION_PAGE_CHANGED = (p: number) =>
  `NOTIFICATION_PAGE_CHANGED_${p}`;

const LoadingComponent: FunctionComponent = props => (
  <div className="loading-container">
    {props.children}
    <div className="loading-icon"></div>
  </div>
);

const PostComponent: FunctionComponent<{ post: Post }> = ({ post }) => {
  function makeActionPost() {
    let actionPost: Json = {};
    actionPost.title = mainPost.title!;
    actionPost.author = post.author!;
    actionPost.nick = post.nick!;
    actionPost.pid = post.pid!;
    actionPost.board = {
      name: mainPost.board!
    };
    actionPost.content = post
      .content!.replace(/<br\/?>/g, "\n")
      .replace(/<.*?>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    return actionPost;
  }
  function doReply() {
    reply(makeActionPost());
  }
  function doActivity() {
    showActivity(makeActionPost());
  }
  return (
    <div className="post" key={post.pid}>
      <div className="post-title">
        <div>
          {post.author}
          {post.nick!.length > 0 ? `(${post.nick})` : ``}
        </div>
        <div>
          <span className="floor">{post.floor}</span>
          <span className="date">{post.dateString}</span>
        </div>
        <div className="post-action">
          <div className="action replay" onClick={doReply}>
            回复
          </div>
          <div className="action more" onClick={doActivity}>
            ...
          </div>
        </div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: post.content || "" }}></div>
    </div>
  );
};

const PostList: FunctionComponent<{ posts: Post[] }> = ({ posts = [] }) => (
  <div>
    {posts.map(post => (
      <PostComponent key={post.pid} post={post} />
    ))}
  </div>
);

const PageComponent: FunctionComponent<{ p: number }> = ({ p }) => {
  function onClick() {
    PubSub.publish(NOTIFICATION_FORCE_LOAD_PAGE, {
      p
    });
  }
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    console.log("sub", p);
    PubSub.subscribe(NOTIFICATION_PAGE_CHANGED(p), () => {
      console.log("in sub", p);
      setFlag(!flag);
    });
    return () => {
      console.log("unsub", p);
      PubSub.unsubscribe(NOTIFICATION_PAGE_CHANGED(p));
    };
  });
  const page = pages[p - 1];
  return (
    <div onClick={onClick}>
      {page.status === Status.success || page.status === Status.incomplete ? (
        <PostList posts={page.posts} />
      ) : null}
      {page.status === Status.fail ? (
        <div className="page-placeholder">{page.errorMessage}</div>
      ) : null}
      {page.status === Status.loading ? (
        <div className="page-placeholder">
          <LoadingComponent>
            <div className="page-loading">正在加载第{page.p}页</div>
          </LoadingComponent>
        </div>
      ) : null}
      {page.status === Status.init ? (
        <div className="page-placeholder page-init">{page.p}</div>
      ) : null}
    </div>
  );
};

///////////////////////////////////////////////////////////////
// page functions
const postsPerPage = 10;
let taskQueue: number[] = [];
const pages: Page[] = [
  {
    title: "",
    total: 0,
    p: 1,
    posts: [],
    status: Status.init
  }
];
const xImages: XImage[] = [];
const maxImageDownloader = 1;
let currentDownloaders = 0;
let mainPost: Post;
let incompletePageNumber = 1;
let pageLoading = false;

async function initPage() {
  mainPost = await postInfo();
  console.log(mainPost);
  loadIncompletePage();
}

async function loadIncompletePage() {
  taskQueue.unshift(incompletePageNumber);
  nextTask();
}

async function loadPage(p: number = 1, author?: string): Promise<Page> {
  const page: Page = {
    title: "",
    total: 0,
    p: p,
    posts: [],
    status: Status.init,
    errorMessage: ""
  };
  try {
    const postGroup = await fetchPostGroup(
      mainPost.board!,
      mainPost.gid!,
      p,
      null
    );
    page.posts = postGroup.posts!;
    page.total = postGroup.total!;
    page.title = postGroup.title!;
    page.status =
      page.posts.length >= postsPerPage ? Status.success : Status.incomplete;
  } catch (e) {
    page.status = Status.fail;
    page.errorMessage = e.toString();
  }
  return page;
}

async function nextTask() {
  console.log("task queue:", taskQueue);
  if (taskQueue.length === 0 || pageLoading) return;
  pageLoading = true;
  const p = taskQueue[0];
  pages[p! - 1]!.status = Status.loading;

  PubSub.publish(NOTIFICATION_PAGE_CHANGED(p), {});

  const page = await loadPage(p);
  if (page.status === Status.fail) {
    console.log("load page error", page);
    pages[p! - 1] = page;
    pageLoading = false;
    PubSub.publish(NOTIFICATION_PAGE_CHANGED(p), {});
    return;
  }
  // load success
  if (p === 1) {
    mainPost.title = page.title;
    setTitle(mainPost.title);
  }
  const totalPage = Math.ceil(page.total / postsPerPage);
  const totalPagesChanged = totalPage !== pages.length;
  // put unloaded pages to queue
  for (let i = pages.length + 1; i <= totalPage; ++i) {
    taskQueue.push(i);
    pages.push({
      title: "",
      total: 0,
      p: i,
      posts: [],
      status: Status.init
    });
  }
  pages[p! - 1] = page;

  page.posts.forEach(({ images }) => {
    xImages.push(...images!);
  });
  loadXImage();

  // set last page always incomplete, try to load new posts
  incompletePageNumber = totalPage;
  // remove current page, task done
  taskQueue.splice(taskQueue.indexOf(p), 1);
  pageLoading = false;

  // setTimeout(() => {
  //   nextTask();
  // }, 3000);

  if (totalPagesChanged) {
    PubSub.publish(NOTIFICATION_TOTAL_PAGES_CHANGED, {});
  }
  PubSub.publish(NOTIFICATION_PAGE_CHANGED(p), {});
}

function orderTaskQueue(index: number) {
  const nextTasks: number[] = [];
  const prevTasks: number[] = [];
  taskQueue.forEach(i => {
    i < index ? prevTasks.push(i) : nextTasks.push(i);
  });
  taskQueue = nextTasks
    .sort((a, b) => a - b)
    .concat(prevTasks.sort((a, b) => a - b));
  console.log("reorder queue:", taskQueue);
  return;
}

async function loadXImage() {
  console.log("xImage:", xImages);
  if (currentDownloaders === maxImageDownloader) {
    console.log("no downloders");
    return;
  }
  const img = xImages.find(img => img.status === Status.init);
  if (!img) {
    console.log("no init images");
    return;
  }
  img.status = Status.loading;
  let { id, src } = img;
  let ret = await download(src, id);
  if (ret === true) {
    (document.querySelector(
      `#ximg-${id}`
    ) as HTMLImageElement).src = `ximg://_?url=${encodeURIComponent(src)}`;
    img.status = Status.success;
  } else {
    console.log(`load image fail: ${src}`);
    img.status = Status.fail;
  }
  loadXImage();
}

initPage();
PubSub.subscribe(
  NOTIFICATION_FORCE_LOAD_PAGE,
  (_: string, msg: { p: number }) => {
    orderTaskQueue(msg.p);
    nextTask();
  }
);

PubSub.subscribe("DOWNLOAD_PROGRESS", (_: string, data: any) => {
  console.log(data);
});

PubSub.subscribe("PAGE_CLOSE", async () => {
  console.log("page close");
  unloaded();
});

export default function PostGroupPage() {
  console.log("render , PostGroupPage");
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    PubSub.subscribe(NOTIFICATION_TOTAL_PAGES_CHANGED, () => {
      console.log("get notify");
      toast({ message: "page changed" });
      setFlag(!flag);
    });
    return () => {
      PubSub.unsubscribe(NOTIFICATION_TOTAL_PAGES_CHANGED);
    };
  });
  return (
    <div className="main">
      <h1>{mainPost && mainPost.title}</h1>
      {/* <img src="ximg://_?url=https://att.newsmth.net/nForum/att/Photo/1936720334/329/large" /> */}
      <div className="page-list">
        {pages.map(page => (
          <PageComponent key={`${page.p}-${page.status}`} p={page.p} />
        ))}
      </div>
      <div className="footer">
        <LoadingComponent>loading</LoadingComponent>
      </div>
    </div>
  );
}
