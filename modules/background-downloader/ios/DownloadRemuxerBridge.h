#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
@interface SFDownloadRemuxerBridge : NSObject
+ (BOOL)remuxVideoPath:(NSString *)videoPath
           audioPaths:(NSArray<NSString *> *)audioPaths
          audioTitles:(NSArray<NSString *> *)audioTitles
       audioLanguages:(NSArray<NSString *> *)audioLanguages
           outputPath:(NSString *)outputPath
           onProgress:(void (^)(double))onProgress
          isCancelled:(BOOL (^)(void))isCancelled
                error:(NSError **)error
    NS_SWIFT_NAME(remux(videoPath:audioPaths:audioTitles:audioLanguages:outputPath:onProgress:isCancelled:));
@end
NS_ASSUME_NONNULL_END
