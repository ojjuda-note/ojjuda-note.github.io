plugins { id("com.android.application") }

val prepareSeasonalResources by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir)
    commandLine("python3", "scripts/prepare_resources.py")
    inputs.files(rootProject.fileTree("../../brand/app-icons/seasonal") { include("**/*.png") })
    inputs.file(rootProject.file("../../shared/app-icons/calendar.json"))
    inputs.files(rootProject.fileTree("baselines") { include("*.json") })
    inputs.files(rootProject.fileTree("scripts") { include("prepare_resources.py") })
    outputs.dir(layout.buildDirectory.dir("generated/seasonal"))
}

android {
    namespace = "kr.ojjuda.shell"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    defaultConfig {
        minSdk = 24
        targetSdk = 36
        versionCode = providers.gradleProperty("releaseVersionCode").orElse("2").get().toInt()
        versionName = providers.gradleProperty("releaseVersionName").orElse("1.1.0").get()
    }
    flavorDimensions += "app"
    productFlavors {
        listOf("agit", "park", "pajang").forEach { app ->
            create(app) {
                dimension = "app"
                applicationId = "kr.ojjuda.$app"
            }
        }
    }
    sourceSets {
        getByName("main").manifest.srcFile(layout.buildDirectory.file("generated/seasonal/main/AndroidManifest.xml"))
        listOf("agit", "park", "pajang").forEach { app ->
            getByName(app).res.srcDir(layout.buildDirectory.dir("generated/seasonal/$app/res"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
        isCoreLibraryDesugaringEnabled = true
    }
    buildTypes {
        getByName("release") {
            signingConfig = null
            isMinifyEnabled = false
        }
        getByName("debug") { signingConfig = null }
    }
    lint { abortOnError = true }
}
// Never generate a debug keystore as a side effect of building this reconstruction.
androidComponents { beforeVariants(selector().withBuildType("debug")) { it.enable = false } }
tasks.named("preBuild").configure { dependsOn(prepareSeasonalResources) }
dependencies {
    implementation(project(":core"))
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
