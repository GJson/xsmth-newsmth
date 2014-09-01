//
//  XImageViewCache.h
//  newsmth
//
//  Created by Maxwin on 13-5-31.
//  Copyright (c) 2013年 nju. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface XImageViewCache : NSObject
+ (XImageViewCache *)sharedInstance;
+ (NSString *)escapeUrl:(NSString *)url;

- (NSString *)pathForUrl:(NSString *)url;
- (BOOL)isInCache:(NSString *)key;
- (UIImage *)getImage:(NSString *)key;
- (void)setImage:(UIImage *)image forUrl:(NSString *)key;
- (void)setImageData:(NSData *)data forUrl:(NSString *)key;

- (unsigned long long)cacheSize;
- (void)clearCache;

@end
