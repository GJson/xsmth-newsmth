//
//  XImageViewCache.m
//  newsmth
//
//  Created by Maxwin on 13-5-31.
//  Copyright (c) 2013年 nju. All rights reserved.
//

#import "XImageViewCache.h"

#define LOCAL_CAHCE_DIRECTORY_DEFAULT @"me.maxwin.newsmth"

static XImageViewCache *instance;

@interface XImageViewCache ()
@property (strong, nonatomic) NSString *cacheDir;
@property (strong, nonatomic) NSCache *memoryCache;
@end

@implementation XImageViewCache
+ (XImageViewCache *)sharedInstance
{
    if (instance == nil) {
        instance = [[XImageViewCache alloc] init];
    }
    return instance;
}

- (id)init
{
    if (instance == nil) {
        self = [super init];
        if (self != nil) {
            NSString *path = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) lastObject];
            if (path) {
                self.cacheDir = [path stringByAppendingPathComponent:LOCAL_CAHCE_DIRECTORY_DEFAULT];
            }
            
            [[NSNotificationCenter defaultCenter] addObserver:self
                                                     selector:@selector(cleanAllMemoryCache)
                                                         name:UIApplicationDidReceiveMemoryWarningNotification
                                                       object:nil];

        }
    } else {
        self = instance;
    }
    return self;
}

- (void)setCacheDir:(NSString *)cacheDir
{
    _cacheDir = cacheDir;
    BOOL isDirectory = YES;
    if (_cacheDir != nil && (![[NSFileManager defaultManager] fileExistsAtPath:_cacheDir isDirectory:&isDirectory] || !isDirectory)) {  // File is not exist or is not directory
        NSError *error = nil;
        [[NSFileManager defaultManager] createDirectoryAtPath:_cacheDir withIntermediateDirectories:YES attributes:nil error:&error];
        if (error != nil) {
            XLog_e(@"create cache dir error: %@", error);
            _cacheDir = nil;
        }
    }
    XLog_d(@"%@", _cacheDir);
}

- (NSString *)escapeKey:(NSString *)key
{
    return [[self class] escapeUrl:key];
}

+ (NSString *)escapeUrl:(NSString *)url
{
    NSCharacterSet *theCharacterSet = [NSCharacterSet characterSetWithCharactersInString:@"+-*!%$:?/"];
    url = [[url componentsSeparatedByCharactersInSet:theCharacterSet] componentsJoinedByString:@"_"];
    return url;
}

- (NSString *)pathForUrl:(NSString *)url
{
    return [_cacheDir stringByAppendingPathComponent:[self escapeKey:url]];
}

- (void)cleanAllMemoryCache
{
    [self.memoryCache removeAllObjects];
}

- (BOOL)isInLocalCache:(NSString *)key
{
    NSString *localCachePath = [_cacheDir stringByAppendingPathComponent:[self escapeKey:key]];
    return [[NSFileManager defaultManager] fileExistsAtPath:localCachePath];
}

#pragma public
- (BOOL)isInCache:(NSString *)key
{
    return [self.memoryCache objectForKey:key] != nil || [self isInLocalCache:key];
}

- (void)setImage:(UIImage *)image forUrl:(NSString *)key
{
    [self.memoryCache setObject:image forKey:key];
    [self setImageData:UIImagePNGRepresentation(image) forUrl:key];
}

- (void)setImageData:(NSData *)data forUrl:(NSString *)key
{
    UIImage *img = [UIImage imageWithData:data];
    [self.memoryCache setObject:img forKey:key];
    if (![self isInLocalCache:key]) {   // 不在本地缓存，写入新缓存
        NSError *error = nil;
        NSString *localCachePath = [_cacheDir stringByAppendingPathComponent:[self escapeKey:key]];
        [data writeToFile:localCachePath options:NSDataWritingFileProtectionComplete error:&error];
        if (error != nil) {
            XLog_e(@"write cache error: %@", error);
        }
    }
}

- (UIImage *)getImage:(NSString *)key
{
    UIImage *image = [self.memoryCache objectForKey:key];
    if (image == nil && [self isInLocalCache:key]) {
        NSString *localCachePath = [_cacheDir stringByAppendingPathComponent:[self escapeKey:key]];
        NSData *data = [NSData dataWithContentsOfFile:localCachePath];
        image = [UIImage imageWithData:data];
    }
    return image;
}

- (unsigned long long)cacheSize
{
    NSArray *filesArray = [[NSFileManager defaultManager] subpathsOfDirectoryAtPath:self.cacheDir error:nil];
    NSEnumerator *filesEnumerator = [filesArray objectEnumerator];
    NSString *fileName;
    unsigned long long fileSize = 0;
    
    while (fileName = [filesEnumerator nextObject]) {
        NSError *error;
        NSString *fullPath = [self.cacheDir stringByAppendingPathComponent:fileName];
        NSDictionary *fileDictionary = [[NSFileManager defaultManager] attributesOfItemAtPath:fullPath error:&error];
        if (!error) {
            fileSize += [fileDictionary fileSize];
        } else {
            XLog_e(@"attribute file error: %@, %@", fullPath, error);
        }
    }
    
    return fileSize;
}

- (void)clearCache
{
    NSFileManager *fileMgr = [[NSFileManager alloc] init];
    NSError *error = nil;
    NSArray *directoryContents = [fileMgr contentsOfDirectoryAtPath:self.cacheDir error:&error];
    if (error == nil) {
        for (NSString *path in directoryContents) {
            NSString *fullPath = [self.cacheDir stringByAppendingPathComponent:path];
            BOOL removeSuccess = [fileMgr removeItemAtPath:fullPath error:&error];
            if (!removeSuccess) {
                XLog_e(@"remove file fail: %@", fullPath);
            } else {
                XLog_d(@"remove file success: %@", fullPath);
            }
        }
    } else {
        XLog_e(@"%@", error);
    }
}

@end
