#import <Foundation/Foundation.h>
#import <os/log.h>
#include <stdio.h>
#include <unistd.h>

static NSString *const HBShareAppGroup = @"group.com.homeboard.native";
static NSString *const HBShareBootFile = @"homeboard-share-boot-v1.log";

static NSString *HBShareSingleLine(NSString *value) {
  if (value == nil) return @"";
  NSString *result = [value stringByReplacingOccurrencesOfString:@"\t" withString:@" "];
  result = [result stringByReplacingOccurrencesOfString:@"\r" withString:@" "];
  result = [result stringByReplacingOccurrencesOfString:@"\n" withString:@" "];
  if (result.length > 360) {
    result = [[result substringToIndex:360] stringByAppendingString:@"…"];
  }
  return result;
}

static void HBShareWriteBootMarker(NSString *stage, NSString *detail) {
  NSURL *container = [[NSFileManager defaultManager]
    containerURLForSecurityApplicationGroupIdentifier:HBShareAppGroup];
  if (container == nil) {
    os_log_error(OS_LOG_DEFAULT, "Homeboard share boot %{public}@; app-group container unavailable", stage);
    return;
  }

  NSURL *fileURL = [container URLByAppendingPathComponent:HBShareBootFile isDirectory:NO];
  NSDictionary *attributes = [[NSFileManager defaultManager]
    attributesOfItemAtPath:fileURL.path
    error:NULL];
  unsigned long long size = [[attributes objectForKey:NSFileSize] unsignedLongLongValue];
  const char *mode = size > (64 * 1024) ? "w" : "a";
  FILE *file = fopen(fileURL.fileSystemRepresentation, mode);
  if (file == NULL) {
    os_log_error(OS_LOG_DEFAULT, "Homeboard share boot %{public}@; marker file unavailable", stage);
    return;
  }

  NSString *safeStage = HBShareSingleLine(stage);
  NSString *safeDetail = HBShareSingleLine(detail);
  fprintf(
    file,
    "%.6f\t%d\t%s\t%s\n",
    [[NSDate date] timeIntervalSince1970],
    getpid(),
    safeStage.UTF8String,
    safeDetail.UTF8String
  );
  fflush(file);
  fclose(file);
  os_log_with_type(
    OS_LOG_DEFAULT,
    OS_LOG_TYPE_DEFAULT,
    "Homeboard share boot %{public}@ %{public}@",
    safeStage,
    safeDetail
  );
}

__attribute__((constructor))
static void HBShareExtensionImageDidLoad(void) {
  @autoreleasepool {
    NSBundle *bundle = [NSBundle mainBundle];
    NSString *bundleID = bundle.bundleIdentifier ?: @"missing";
    NSString *build = [bundle objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"missing";
    NSString *executable = [bundle objectForInfoDictionaryKey:@"CFBundleExecutable"] ?: @"missing";
    HBShareWriteBootMarker(
      @"binary.constructor",
      [NSString stringWithFormat:@"bundle=%@ build=%@ executable=%@", bundleID, build, executable]
    );
  }
}
