#import <Foundation/Foundation.h>
#import <dlfcn.h>
int main(void) { @autoreleasepool {
 void *handle = dlopen("/tmp/inkora-sparkle-2.10.0/Sparkle.framework/Sparkle", RTLD_NOW);
 if (!handle) { fprintf(stderr, "%s\n", dlerror()); return 1; }
 printf("Sparkle class loaded: %s\n", NSClassFromString(@"SPUUpdater") ? "yes" : "no"); return 0;
} }
